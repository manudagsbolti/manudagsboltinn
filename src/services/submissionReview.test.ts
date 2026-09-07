// @vitest-environment jsdom
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { db } from '../db/localDb'
import { addPlayer, createSession, createSet, startGame, recordGoal, completeSession, updateDraftRoster } from '../data/repository'
import { queueSubmission } from './submissions'
import { flushSyncQueue } from './syncQueue'
import { syncCloud } from './cloudSync'
import { fromSnakeCase, toSnakeCase } from './syncData'
import { signOutSafely } from './access'
import { buildSeasonAnalytics } from './seasonAnalytics'
import setupSql from '../../supabase/setup-empty-project.sql?raw'

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
        : await asUser('select public.get_submission_roster() result')
      return { data: result.rows[0].result, error: null }
    } catch (error) { return { data: null, error } }
  })
})
afterAll(async () => { online(false); localStorage.clear(); await pg.close() })
async function night() {
  const players = await Promise.all(['Anna','Ari','Bára','Bjarni'].map(n => addPlayer(n)))
  // August used to require a pre-opened recording window/custom season.
  const session = await createSession({ playedOn: '2026-08-31', playerIds: players.map(p => p.id), gameDurationSeconds: 180, winsPerPoint: 1, pointsToWinSet: 4 })
  const set = await createSet(session.id, [{ name:'A',color:'red',playerIds:players.slice(0,2).map(p=>p.id) },{ name:'B',color:'blue',playerIds:players.slice(2).map(p=>p.id) }])
  for (let i=0;i<4;i++) {
    const game = (await db.games.where('setId').equals(set.id).sortBy('gameNo')).at(-1)!
    await startGame(game.id)
    await recordGoal({ gameId:game.id,teamId:game.holderTeamId,scorerPlayerId:players[0].id,assistPlayerId:players[1].id })
  }
  await completeSession(session.id)
  return { session, players }
}
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
