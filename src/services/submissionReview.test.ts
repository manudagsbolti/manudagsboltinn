// @vitest-environment jsdom
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { db } from '../db/localDb'
import { addPlayer, createSession, createSet, startGame, recordGoal, completeSession, updateDraftRoster, createHistoricalSession } from '../data/repository'
import { queueSubmission } from './submissions'
import { flushSyncQueue } from './syncQueue'
import { syncCloud } from './cloudSync'
import { fromSnakeCase, toSnakeCase } from './syncData'
import { signOutSafely } from './access'
import { buildSeasonAnalytics } from './seasonAnalytics'
import { cacheRecorderRatings } from './recorderRatings'
import setupSql from '../../supabase/setup-empty-project.sql?raw'
import { readGameHistory, saveGameEdit, reverseGameCorrection } from '../data/gameHistory'

const mock = vi.hoisted(() => ({ rpc: vi.fn(), getSession: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: { rpc: mock.rpc, auth: { getSession: mock.getSession } }, hasSupabaseConfig: true }))
const admin = '00000000-0000-0000-0000-000000000001'
const recorder = '00000000-0000-0000-0000-000000000002'
let pg: PGlite
const online = (value: boolean) => Object.defineProperty(navigator, 'onLine', { value, configurable: true })
async function asUser(sql: string, args: unknown[] = [], uid = recorder) {
  return pg.transaction(async tx => {
    await tx.exec('set local role authenticated')
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [uid])
    return tx.query<{ result: unknown }>(sql, args)
  })
}
beforeAll(async () => {
  pg = new PGlite()
  await pg.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated;
    alter default privileges in schema public grant all on tables to anon,authenticated;
    alter default privileges in schema public grant execute on functions to anon,authenticated;
    insert into auth.users values ('${admin}'),('${recorder}');`)
  await pg.exec(setupSql)
  await pg.query('insert into public.app_admins values ($1)', [admin])
  await pg.query('insert into public.app_recorders values ($1)', [recorder])
}, 30000)
beforeEach(async () => {
  online(false)
  localStorage.clear()
  await db.transaction('rw', db.tables, async () => { for (const t of db.tables) await t.clear() })
  await pg.exec('truncate public.night_submissions, public.players, public.seasons, public.sessions, public.sync_operations cascade')
  localStorage.setItem('manudagsboltinn-access', JSON.stringify({ userId: recorder, role: 'recorder', workflow: 'submission' }))
  mock.getSession.mockResolvedValue({ data: { session: { user: { id: recorder } } }, error: null })
  mock.rpc.mockReset().mockImplementation(async (name, args) => {
    try {
      const result = name === 'submit_night'
        ? await asUser('select public.submit_night($1,$2,$3::jsonb) result', [args.submission_id, args.receipt_token, JSON.stringify(args.facts)])
        : name === 'get_submission_ratings' ? await asUser('select public.get_submission_ratings() result') : await asUser('select public.get_submission_roster() result')
      return { data: result.rows[0].result, error: null }
    } catch (error) { return { data: null, error } }
  })
})
afterAll(async () => { online(false); localStorage.clear(); await pg.close() })
async function night(assistsEnabled = true) {
  const players = await Promise.all(['Anna','Ari','Bára','Bjarni'].map(n => addPlayer(n)))
  // August used to require a pre-opened recording window/custom season.
  const session = await createSession({ assistsEnabled, playedOn: '2026-08-31', playerIds: players.map(p => p.id), gameDurationSeconds: 180, winsPerPoint: 1, pointsToWinSet: 4 })
  const set = await createSet(session.id, [{ name:'A',color:'red',playerIds:players.slice(0,2).map(p=>p.id) },{ name:'B',color:'blue',playerIds:players.slice(2).map(p=>p.id) }])
  for (let i=0;i<4;i++) {
    const game = (await db.games.where('setId').equals(set.id).sortBy('gameNo')).at(-1)!
    await startGame(game.id)
    await recordGoal({ gameId:game.id,teamId:game.holderTeamId,scorerPlayerId:players[0].id,assistPlayerId:players[1].id })
  }
  await completeSession(session.id)
  return { session, players }
}
it('syncs correction numbering and reversal atomically, with audit history and receipt retries', async () => {
  const { session, players } = await night(false)
  const seasonId = crypto.randomUUID()
  await pg.query("insert into public.seasons(id,name,starts_on,ends_on) values ($1,'Season','2026-08-01','2026-12-31')", [seasonId])
  await queueSubmission(session.id)
  online(true); await flushSyncQueue(); online(false)
  await asUser('select public.review_night($1,true,$2,$3) result', [session.id,'2026-08-31',seasonId],admin)
  expect((await pg.query('select assists_enabled from public.sessions where id=$1',[session.id])).rows[0]).toEqual({assists_enabled:false})
  const captains=(await pg.query<{captain_player_id:string}>('select captain_player_id from public.set_teams where set_id in (select id from public.sets where session_id=$1)',[session.id])).rows
  expect(captains).toHaveLength(4)
  expect(captains.every(t=>!!t.captain_player_id)).toBe(true)
  await expect(asUser('update public.set_teams set captain_player_id=$1 where set_id in (select id from public.sets where session_id=$2)',[players[0].id,session.id],admin)).rejects.toThrow()
  expect((await pg.query('select assists_recorded,assist_player_id from public.goals')).rows).toEqual(Array.from({length:4},()=>({assists_recorded:false,assist_player_id:null})))
  await db.submissions.clear()
  localStorage.setItem('manudagsboltinn-access',JSON.stringify({userId:admin,role:'admin'}))
  await db.sessions.update(session.id,{seasonId})
  const set=(await db.sets.where('sessionId').equals(session.id).sortBy('setNo'))[0]
  const original=await readGameHistory(set.id)
  const send = async () => {
    const ops=(await db.syncQueue.orderBy('createdAt').toArray()).map(row=>toSnakeCase({id:row.id,table:row.table,entityId:row.entityId,operation:row.operation,payload:row.payload}))
    const result=await asUser('select public.apply_sync_batch($1::jsonb) result',[JSON.stringify(ops)],admin)
    const retry=await asUser('select public.apply_sync_batch($1::jsonb) result',[JSON.stringify(ops)],admin)
    expect(result.rows[0].result).toBe(ops.length)
    expect(retry.rows[0].result).toBe(0)
    await db.syncQueue.clear()
  }
  await saveGameEdit(session.id,original,{deleteGameId:original.games[1].id},'Duplicate game')
  await send()
  expect((await pg.query('select game_no from public.games where set_id=$1 order by game_no',[set.id])).rows).toEqual([{game_no:1},{game_no:2},{game_no:3}])
  const correction=(await db.sessions.get(session.id))!.gameCorrections!.at(-1)!
  await reverseGameCorrection(session.id,correction.id)
  await send()
  expect((await pg.query('select count(*)::int n from public.games where set_id=$1',[set.id])).rows[0]).toEqual({n:4})
  const restored=await readGameHistory(set.id)
  await saveGameEdit(session.id,restored,{position:2,holderTeamId:restored.games[0].holderTeamId,challengerTeamId:restored.games[0].challengerTeamId,result:'timeout',winningTeamId:'',scorerPlayerId:'',assistPlayerId:'',ownGoal:false,exitingTeamId:''},'Missing timeout')
  await send()
  expect((await pg.query('select game_no from public.games where set_id=$1 order by game_no',[set.id])).rows).toEqual([1,2,3,4,5].map(game_no=>({game_no})))
  let before=await readGameHistory(set.id)
  const game=before.games[0]
  await saveGameEdit(session.id,before,{gameId:game.id,position:3,holderTeamId:game.holderTeamId,challengerTeamId:game.challengerTeamId,result:'goal',winningTeamId:game.challengerTeamId,scorerPlayerId:players[0].id,assistPlayerId:'',ownGoal:true,exitingTeamId:''},'Wrong team, own goal')
  await send()
  const row=(await pg.query<{game_corrections:unknown}>('select game_corrections from public.sessions where id=$1',[session.id])).rows[0]
  expect(Array.isArray(row.game_corrections)).toBe(true)
  expect((row.game_corrections as unknown[]).length).toBe(4)
  const cloud=await asUser('select public.get_sync_state() result',[],admin)
  const state=fromSnakeCase((cloud.rows[0].result as {tables:unknown}).tables) as {sessions: Array<{id:string;gameCorrections:unknown}>}
  expect(state.sessions.find(s=>s.id===session.id)?.gameCorrections).toBeDefined()
  const denied=await asUser('select public.apply_sync_batch($1::jsonb) result',['[]']).catch(e=>e)
  expect(denied).toBeInstanceOf(Error)
})
it('syncs draft attendance removal and addition without recreating the night', async () => {
  localStorage.setItem('manudagsboltinn-access', JSON.stringify({ userId: admin, role: 'admin' }))
  const players = []
  for (const name of ['A','B','C','D','E']) players.push(await addPlayer(name))
  const session = await createSession({ playedOn: '2026-09-07', playerIds: players.slice(0,4).map(p => p.id), gameDurationSeconds: 180, winsPerPoint: 1, pointsToWinSet: 4 })
  const sendQueue = async () => {
    const ops = (await db.syncQueue.orderBy('createdAt').toArray()).map(item => toSnakeCase({ id: item.id, table: item.table, entityId: item.entityId, operation: item.operation, payload: item.payload }))
    await asUser('select public.apply_sync_batch($1::jsonb) result', [JSON.stringify(ops)], admin)
    await db.syncQueue.clear()
    return ops
  }
  await sendQueue()
  await updateDraftRoster(session.id, players.slice(1).map(p => p.id))
  const ops = await sendQueue()
  // Receipt retries are harmless, including the composite attendance delete.
  await asUser('select public.apply_sync_batch($1::jsonb) result', [JSON.stringify(ops)], admin)
  const rows = await pg.query<{ player_id: string }>('select player_id from public.session_players where session_id=$1', [session.id])
  expect(rows.rows.map(r => r.player_id).sort()).toEqual(players.slice(1).map(p => p.id).sort())
  expect(await db.sessions.toArray()).toEqual([session])
  await createSet(session.id, [{name:'A',color:'red',playerIds:players.slice(1,3).map(p=>p.id)}, {name:'B',color:'blue',playerIds:players.slice(3).map(p=>p.id)}])
  await expect(updateDraftRoster(session.id, players.slice(0,4).map(p=>p.id))).rejects.toThrow('fyrsta sett')
  await sendQueue()
  const deletion = [{ id: crypto.randomUUID(), table:'session_players', entity_id:`${session.id}:${players[1].id}`, operation:'delete' }]
  await expect(asUser('select public.apply_sync_batch($1::jsonb) result', [JSON.stringify(deletion)], admin)).rejects.toThrow('first set')
  await expect(asUser('select public.apply_sync_batch($1::jsonb) result', [JSON.stringify(deletion)])).rejects.toThrow('Admin')
})
it('records without dates opened, queues offline, retries once, and approves atomically into season statistics', async () => {
  const { session, players } = await night()
  expect(await db.syncQueue.count()).toBe(0)
  await expect(signOutSafely()).rejects.toThrow('ósendar')
  await queueSubmission(session.id)
  expect((await db.submissions.get(session.id))?.state).toBe('queued')
  expect(await flushSyncQueue()).toEqual({ synced:0,failed:0 })
  const realRpc = mock.rpc.getMockImplementation()!
  mock.rpc.mockImplementationOnce(async (...args) => { const result = await realRpc(...args); expect(result.error).toBeNull(); return { data:null,error: new Error('lost response') } })
  online(true)
  expect((await flushSyncQueue()).failed).toBe(1)
  expect(await flushSyncQueue()).toEqual({ synced:1,failed:0 })
  expect((await pg.query('select * from public.night_submissions')).rows).toHaveLength(1)
  expect((await pg.query('select * from public.sessions')).rows).toHaveLength(0)
  const seasonId = crypto.randomUUID()
  await pg.query("insert into public.seasons(id,name,starts_on,ends_on) values ($1,'Haust','2026-08-31','2026-12-31')",[seasonId])
  const roles = { [players[0].id]:'REGULAR' }
  const approved = await asUser("select public.review_night($1,true,'2026-08-31',$2,$3::jsonb) result",[session.id,seasonId,JSON.stringify(roles)],admin)
  expect(approved.rows[0].result).toBe('approved')
  await asUser("select public.review_night($1,true,'2026-08-31',$2,$3::jsonb)",[session.id,seasonId,JSON.stringify(roles)],admin)
  expect((await pg.query('select * from public.sessions')).rows).toHaveLength(1)
  const state = (await asUser('select public.get_sync_state() result',[],admin)).rows[0].result as { tables: Record<string,unknown[]> }
  expect(state.tables.goals).toHaveLength(4)
  const data = fromSnakeCase(state.tables) as any
  const stats = buildSeasonAnalytics({ players:data.players,sessions:data.sessions,attendance:data.sessionPlayers,sets:data.sets,teams:data.setTeams,memberships:data.setTeamMembers,games:data.games,goals:data.goals }, data.seasons[0])
  expect(stats.totals.nights).toBe(1)
  expect(data.sessionPlayers.find((r:any) => r.playerId === players[0].id).roleAtSession).toBe('REGULAR')
  const allStats = buildSeasonAnalytics({ players:data.players,sessions:data.sessions,attendance:data.sessionPlayers,sets:data.sets,teams:data.setTeams,memberships:data.setTeamMembers,games:data.games,goals:data.goals }, data.seasons[0], 'ALL')
  await cacheRecorderRatings((await asUser('select public.get_submission_ratings() result')).rows[0].result)
  expect((await db.ratingCache.get(seasonId))?.ratings).toEqual(Object.fromEntries(allStats.players.map(p => [p.playerId,p.rating])))
  await syncCloud()
  expect((await db.submissions.get(session.id))?.state).toBe('approved')
  expect(await db.sessions.count()).toBe(1)
})
it('hides all other nights/inbox, rejects direct writes and approval, and keeps rejected retries rejected', async () => {
  const {session} = await night()
  await queueSubmission(session.id); online(true); await flushSyncQueue()
  const saved = (await db.submissions.get(session.id))!
  expect((await asUser('select * from public.night_submissions')).rows).toHaveLength(0)
  await expect(asUser('select public.get_sync_state()')).rejects.toThrow('Admin access required')
  await expect(asUser("select public.apply_sync_batch('[]'::jsonb)")).rejects.toThrow('Admin access required')
  await expect(asUser('select public.review_night($1,false)',[session.id])).rejects.toThrow('Admin access required')
  await expect(asUser('select public.submit_night($1,$2,$3::jsonb)',[session.id,crypto.randomUUID(),JSON.stringify(toSnakeCase(saved.payload))])).rejects.toThrow('Invalid receipt')
  await asUser('select public.review_night($1,false)',[session.id],admin)
  await flushSyncQueue()
  expect((await db.submissions.get(session.id))?.state).toBe('rejected')
  expect((await pg.query('select * from public.sessions')).rows).toHaveLength(0)
})

it('derives manual-night ratings matching admin and preserves the cached values offline', async () => {
  localStorage.setItem('manudagsboltinn-access', JSON.stringify({ userId: admin, role: 'admin' }))
  const players = []
  for (const name of ['A','B','C','D']) players.push(await addPlayer(name))
  await createHistoricalSession({ playedOn:'2026-09-07', teams:[
    {code:'A',name:'Red',color:'red',playerIds:players.slice(0,2).map(p=>p.id)},
    {code:'B',name:'Blue',color:'blue',playerIds:players.slice(2).map(p=>p.id)}
  ], rounds:[{roundNo:1,teamGoals:{A:4,B:3}},{roundNo:2,teamGoals:{A:1,B:4}}], playerGoals:players.map((p,i)=>({playerId:p.id,goals:[5,0,3,4][i]})) })
  const operations = toSnakeCase(await db.syncQueue.orderBy('createdAt').toArray())
  await asUser('select public.apply_sync_batch($1::jsonb) result',[JSON.stringify(operations)],admin)
  const season = (await db.seasons.toArray())[0]
  const expected = buildSeasonAnalytics({ players, sessions:await db.sessions.toArray(), attendance:await db.sessionPlayers.toArray(), sets:[], teams:[], memberships:[], games:[], goals:[], backfills:await db.sessionBackfills.toArray() },season,'ALL')
  const result = (await asUser('select public.get_submission_ratings() result')).rows[0].result
  await cacheRecorderRatings(result)
  const cached = await db.ratingCache.get(season.id)
  expect(cached?.ratings).toEqual(Object.fromEntries(expected.players.map(p=>[p.playerId,p.rating])))
  expect(cached?.rolePeriods).toEqual(await db.rolePeriods.toArray())
  expect(new Set(Object.values(cached!.ratings)).size).toBeGreaterThan(1)
  await expect(cacheRecorderRatings({broken:true})).rejects.toThrow()
  expect(await db.ratingCache.get(season.id)).toEqual(cached)
  await expect(asUser('select public.get_submission_ratings()',[],crypto.randomUUID())).rejects.toThrow('Access denied')
})

it('rolls back malformed approval and out-of-season dates without touching existing facts', async () => {
  const { session } = await night()
  await queueSubmission(session.id)
  const local = (await db.submissions.get(session.id))!
  const payload = toSnakeCase(local.payload) as any
  payload.attendance[0].session_id = crypto.randomUUID()
  await asUser('select public.submit_night($1,$2,$3::jsonb)', [session.id,local.token,JSON.stringify(payload)])
  const seasonId = crypto.randomUUID()
  await pg.query("insert into public.seasons(id,name,starts_on,ends_on) values ($1,'Haust','2026-08-31','2026-12-31')",[seasonId])
  await expect(asUser("select public.review_night($1,true,'2026-08-30',$2)",[session.id,seasonId],admin)).rejects.toThrow('Choose date')
  await expect(asUser("select public.review_night($1,true,'2026-08-31',$2)",[session.id,seasonId],admin)).rejects.toThrow('Attendance outside night')
  expect((await pg.query('select * from public.players')).rows).toHaveLength(0)
  expect((await pg.query('select * from public.sessions')).rows).toHaveLength(0)
  expect((await pg.query('select state from public.night_submissions')).rows[0]).toEqual({state:'pending'})
})
