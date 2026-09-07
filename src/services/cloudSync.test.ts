import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/localDb'
import { addPlayer, createSession, createSet, recordGoal, startGame, undoLastScoringAction, recoverRunningGames, setPlayerRole } from '../data/repository'
import { syncCloud } from './cloudSync'
import { flushSyncQueue } from './syncQueue'
import { readLocalSyncState, syncTables, toSnakeCase } from './syncData'
import setupSql from '../../supabase/setup-empty-project.sql?raw'
import { restoreBackup } from './backup'
import { completeSession, correctSessionPlayerRole, deleteSession, createHistoricalSession } from '../data/repository'

const cloud = vi.hoisted(() => ({ rpc: vi.fn(), getSession: vi.fn() }))
vi.mock('../lib/supabase', () => ({
  supabase: { rpc: cloud.rpc, auth: { getSession: cloud.getSession } }, hasSupabaseConfig: true,
}))

const admin = '00000000-0000-0000-0000-000000000001'
const outsider = '00000000-0000-0000-0000-000000000002'
const recorder = '00000000-0000-0000-0000-000000000003'
let pg: PGlite
function online(value: boolean) { Object.defineProperty(navigator, 'onLine', { value, configurable: true }) }

async function rpc(name: string, args?: { operations: unknown[] }, user = admin) {
  try {
    const data = await pg.transaction(async tx => {
      await tx.exec('set local role authenticated')
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [user])
      const result = name === 'apply_sync_batch'
        ? await tx.query<{ result: unknown }>('select public.apply_sync_batch($1::jsonb) as result', [JSON.stringify(args?.operations)])
        : await tx.query<{ result: unknown }>('select public.get_sync_state() as result')
      return result.rows[0].result
    })
    return { data, error: null }
  } catch (error) { return { data: null, error } }
}

beforeAll(async () => {
  pg = new PGlite()
  // Reproduce Supabase roles, auth.uid and permissive default object grants.
  // The migrations must explicitly tighten them, not rely on a blank PG ACL.
  await pg.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
    insert into auth.users values ('${admin}'), ('${outsider}'), ('${recorder}');
  `)
  const migrations = import.meta.glob('../../supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  for (const file of Object.keys(migrations).sort()) {
    expect(setupSql).toContain(migrations[file].trim())
  }
  // Regression coverage for the deployed pre-submission contract (001–010).
  // submissionReview.test.ts exercises the full latest generated setup.
  await pg.exec(Object.keys(migrations).sort().filter(f => !f.endsWith('011_submission_review.sql')).map(f => migrations[f]).join('\n'))
  await pg.query('insert into public.app_admins values ($1)', [admin])
  await pg.query('insert into public.app_recorders values ($1)', [recorder])
}, 30_000)

beforeEach(async () => {
  online(false)
  await flushSyncQueue()
  await db.transaction('rw', db.tables, async () => { for (const table of db.tables) await table.clear() })
  await pg.exec('truncate public.players, public.seasons, public.sessions, public.sync_operations cascade')
  cloud.getSession.mockResolvedValue({ data: { session: { user: { id: admin } } }, error: null })
  cloud.rpc.mockReset().mockImplementation(rpc)
})
afterAll(async () => { online(false); await flushSyncQueue(); await pg?.close() })

async function setup(teamCount = 3) {
  const players = await Promise.all(['A1', 'A2', 'B1', 'B2', 'C1'].map(name => addPlayer(name)))
  const session = await createSession({ playedOn: '2026-09-07', playerIds: players.map(p => p.id), gameDurationSeconds: 180, winsPerPoint: 1, pointsToWinSet: 4 })
  const drafts = [
    { name: 'A', color: 'red', playerIds: players.slice(0, 2).map(p => p.id) },
    { name: 'B', color: 'blue', playerIds: players.slice(2, 4).map(p => p.id) },
    { name: 'C', color: 'green', playerIds: players.slice(4).map(p => p.id) },
  ]
  if (teamCount === 2) drafts[1].playerIds.push(players[4].id)
  const set = await createSet(session.id, drafts.slice(0, teamCount))
  return { players, session, set }
}
async function latest() {
  const sets = (await db.sets.toArray()).sort((a, b) => a.setNo - b.setNo)
  return (await db.games.where('setId').equals(sets.at(-1)!.id).sortBy('gameNo')).at(-1)!
}
async function score() {
  const game = await latest()
  await startGame(game.id)
  const members = await db.setTeamMembers.filter(m => m.teamId === game.holderTeamId).toArray()
  await recordGoal({ gameId: game.id, teamId: game.holderTeamId, scorerPlayerId: members[0].playerId, assistPlayerId: members[1]?.playerId })
}
async function count(table: string) { return (await pg.query<{ n: number }>(`select count(*)::int as n from public.${table}`)).rows[0].n }

async function recorderQuery(sql: string, params: unknown[] = []) {
  return pg.transaction(async tx => {
    await tx.exec('set local role authenticated')
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [recorder])
    return tx.query(sql, params)
  })
}

describe('shared recorder permissions enforced by PostgreSQL', () => {
  it('can record the open night and Undo, but cannot fetch history, seasons, raw roles or snapshots', async () => {
    const { session: old, players } = await setup()
    await score(); online(true); await flushSyncQueue(); online(false)
    await pg.query('insert into public.recording_window(played_on, season_id, is_open) values ($1,$2,true)', ['2026-09-14', old.seasonId])
    const current = await createSession({ seasonId: old.seasonId!, playedOn: '2026-09-14', playerIds: players.map(p => p.id), gameDurationSeconds: 180, winsPerPoint: 1, pointsToWinSet: 4 })
    const set = await createSet(current.id, [
      { name: 'A', color: 'red', playerIds: players.slice(0, 2).map(p => p.id) },
      { name: 'B', color: 'blue', playerIds: players.slice(2).map(p => p.id) },
    ])
    const game = (await db.games.where('setId').equals(set.id).toArray())[0]
    await startGame(game.id)
    await recordGoal({ gameId: game.id, teamId: game.holderTeamId, scorerPlayerId: players[0].id })
    for (let i = 0; i < 3; i++) {
      const activeSet = (await db.sets.where('sessionId').equals(current.id).sortBy('setNo')).at(-1)!
      const nextGame = (await db.games.where('setId').equals(activeSet.id).sortBy('gameNo')).at(-1)!
      await startGame(nextGame.id)
      await recordGoal({ gameId: nextGame.id, teamId: nextGame.holderTeamId, scorerPlayerId: players[0].id })
    }
    cloud.rpc.mockImplementation((name, args) => rpc(name, args, recorder))
    online(true)
    const upload = await flushSyncQueue()
    expect((await cloud.rpc.mock.results.at(-1)?.value)?.error?.message).toBeUndefined()
    expect(upload.failed).toBe(0)
    const state = (await rpc('get_sync_state', undefined, recorder)).data as { tables: Record<string, Record<string, unknown>[]> }
    expect(state.tables.sessions.map(s => s.id)).toEqual([current.id])
    expect(state.tables.goals).toHaveLength(4)
    expect(state.tables.seasons[0]).toMatchObject({ name: 'Skráning', starts_on: '2026-09-14', ends_on: '2026-09-14' })
    for (const table of ['seasons', 'player_role_periods', 'session_snapshots', 'app_admins']) {
      expect((await recorderQuery(`select * from public.${table}`)).rows).toHaveLength(0)
    }
    expect((await recorderQuery('select * from public.sessions where id = $1', [old.id])).rows).toHaveLength(0)
    online(false); await undoLastScoringAction(current.id); online(true)
    expect((await flushSyncQueue()).failed).toBe(0)
    expect(await count('session_snapshots')).toBe(2)
    expect((await pg.query<{ n: number }>('select count(*)::int n from public.games where set_id = $1', [set.id])).rows[0].n).toBe(4)
  })

  it('rejects history changes, season writes, opening access, and privilege escalation', async () => {
    const { session, players } = await setup(); await score(); online(true); await flushSyncQueue()
    const oldGame = (await db.games.toArray())[0]
    await pg.query('insert into public.recording_window(played_on, season_id, is_open) values ($1,$2,true)', ['2026-09-14', session.seasonId])
    const operations = [
      { table: 'sessions', operation: 'upsert', payload: { ...session, playedOn: '2026-09-14' } },
      { table: 'games', operation: 'delete', entityId: oldGame.id },
      { table: 'seasons', operation: 'upsert', payload: { ...(await db.seasons.toArray())[0], name: 'Changed' } },
      { table: 'players', operation: 'upsert', payload: { ...players[0], name: 'Changed' } },
      { table: 'app_admins', operation: 'upsert', payload: { user_id: recorder } },
    ]
    for (const op of operations) {
      const result = await rpc('apply_sync_batch', { operations: [toSnakeCase({ ...op, id: crypto.randomUUID() })] }, recorder)
      expect(result.error).toBeTruthy()
    }
    await expect(recorderQuery('select public.set_recording_window($1,$2,true)', ['2026-09-07', session.seasonId])).rejects.toThrow()
    await expect(recorderQuery('insert into public.app_admins values ($1)', [recorder])).rejects.toThrow()
    await expect(recorderQuery('select * from public.v_season_player_stats')).rejects.toThrow()
    expect((await pg.query<{ played_on: string }>('select played_on::text from public.sessions')).rows[0].played_on).toBe('2026-09-07')
  })

  it('allows new substitutes, returns only roles effective that night, and closes access immediately', async () => {
    const { session, players } = await setup()
    await setPlayerRole(session.seasonId!, players[0].id, 'REGULAR', '2026-09-01')
    await setPlayerRole(session.seasonId!, players[0].id, 'SUBSTITUTE', '2026-09-08')
    online(true); await flushSyncQueue(); online(false)
    await pg.query('insert into public.recording_window(played_on, season_id, is_open) values ($1,$2,true)', [session.playedOn, session.seasonId])
    await addPlayer('New substitute')
    cloud.rpc.mockImplementation((name, args) => rpc(name, args, recorder))
    online(true); expect((await flushSyncQueue()).failed).toBe(0)
    const state = (await rpc('get_sync_state', undefined, recorder)).data as { tables: Record<string, Record<string, unknown>[]> }
    expect(state.tables.player_role_periods).toHaveLength(1)
    expect(state.tables.player_role_periods[0]).toMatchObject({ role: 'REGULAR', valid_from: session.playedOn, valid_to: session.playedOn })
    const attendance = (await db.sessionPlayers.toArray()).find(p => p.playerId === players[1].id)!
    const forged = { ...attendance, roleAtSession: 'REGULAR' }
    expect((await rpc('apply_sync_batch', { operations: [toSnakeCase({ id: crypto.randomUUID(), table: 'session_players', operation: 'upsert', payload: forged })] }, recorder)).error).toBeNull()
    expect((await pg.query<{ role_at_session: string }>('select role_at_session from public.session_players where session_id = $1 and player_id = $2', [session.id, players[1].id])).rows[0].role_at_session).toBe('SUBSTITUTE')
    await pg.exec('update public.recording_window set is_open = false')
    const closed = (await rpc('get_sync_state', undefined, recorder)).data as { tables: Record<string, unknown[]> }
    expect(closed.tables.sessions).toHaveLength(0)
    expect(closed.tables.seasons).toHaveLength(0)
    await pg.query('delete from public.app_recorders where user_id = $1', [recorder])
    expect((await rpc('get_sync_state', undefined, recorder)).error).toBeTruthy()
    await pg.query('insert into public.app_recorders values ($1)', [recorder])
  })
})

describe('actual PostgreSQL cloud contract', () => {
  it('deletes one recorded night with queued writes, retries a lost response, and preserves players, season and another manual night', async () => {
    const { session, players } = await setup()
    await score()
    await completeSession(session.id)
    const other = await createHistoricalSession({ playedOn: '2026-09-14', teams: [{ code: 'A', name: 'A', color: 'red', playerIds: [players[0].id] }], rounds: [{ roundNo: 1, teamGoals: { A: 4 } }], playerGoals: [{ playerId: players[0].id, goals: 4 }] })
    online(true)
    expect(await flushSyncQueue()).toMatchObject({ failed: 0 })
    online(false)
    await correctSessionPlayerRole(session.id, players[0].id, 'REGULAR', 'Test')
    await deleteSession(session.id)
    expect(await db.sessions.get(session.id)).toBeUndefined()
    expect(await db.goals.count()).toBe(0)
    expect(await db.games.count()).toBe(0)
    expect(await db.sets.count()).toBe(0)
    expect(await db.setTeams.count()).toBe(0)
    expect(await db.setTeamMembers.count()).toBe(0)
    expect(await db.timerEvents.count()).toBe(0)
    expect(await db.undoActions.count()).toBe(0)
    cloud.rpc.mockImplementationOnce(async (name, args) => { const result = await rpc(name, args); expect(result.error).toBeNull(); return { data: null, error: new Error('Lost response') } })
    online(true)
    expect((await flushSyncQueue()).failed).toBeGreaterThan(0)
    const retried = await flushSyncQueue()
    expect((await cloud.rpc.mock.results.at(-1)?.value)?.error?.message).toBeUndefined()
    expect(retried).toMatchObject({ failed: 0 })
    await syncCloud()
    expect((await db.sessions.toArray()).map(s => s.id)).toEqual([other.id])
    expect(await db.players.count()).toBe(players.length)
    expect(await db.seasons.count()).toBe(1)
    expect(await count('session_snapshots')).toBe(1)
    online(false)
    await deleteSession(other.id)
    online(true)
    expect(await flushSyncQueue()).toMatchObject({ failed: 0 })
    expect(await count('session_backfills')).toBe(0)
    expect(await count('session_players')).toBe(0)
    expect(await count('session_snapshots')).toBe(0)
    expect(await count('players')).toBe(players.length)
  })
  it('denies recorder deletion through both RPC and direct SQL, and refuses live-night deletion locally', async () => {
    const { session } = await setup()
    await expect(deleteSession(session.id)).rejects.toThrow('Ljúktu')
    online(true); await flushSyncQueue()
    await pg.query('insert into public.recording_window(id, played_on, season_id, is_open) values (true, $1, $2, true)', [session.playedOn, session.seasonId])
    expect((await rpc('apply_sync_batch', { operations: [{ id: crypto.randomUUID(), table: 'sessions', operation: 'delete', entity_id: session.id }] }, recorder)).error).toBeTruthy()
    await expect(pg.transaction(async tx => {
      await tx.exec('set local role authenticated')
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [recorder])
      await tx.query('delete from public.sessions where id = $1', [session.id])
    })).rejects.toThrow('Admin access required')
    expect(await count('sessions')).toBe(1)
  })
  it('syncs admin role corrections and history, restores them, and protects them from recorder writes', async () => {
    const { session, players } = await setup()
    await completeSession(session.id)
    await correctSessionPlayerRole(session.id, players[0].id, 'REGULAR', 'Röng uppsetning')
    online(true)
    expect(await flushSyncQueue()).toMatchObject({ failed: 0 })
    await pg.query('insert into public.recording_window(id, played_on, season_id, is_open) values (true, $1, $2, true)', [session.playedOn, session.seasonId])
    const row = (await db.sessionPlayers.get([session.id, players[0].id]))!
    const attack = { id: crypto.randomUUID(), table: 'session_players', operation: 'upsert', payload: toSnakeCase({ ...row, roleAtSession: 'SUBSTITUTE', roleCorrections: [] }) }
    expect((await rpc('apply_sync_batch', { operations: [attack] }, recorder)).error).toBeNull()
    await db.sessionPlayers.clear()
    await syncCloud()
    expect(await db.sessionPlayers.get([session.id, players[0].id])).toMatchObject({ roleAtSession: 'REGULAR', roleCorrections: [{ fromRole: 'SUBSTITUTE', toRole: 'REGULAR', reason: 'Röng uppsetning' }] })
    const snapshot = await pg.query<{ history: unknown[] }>("select payload->'session_players' as history from public.session_snapshots where session_id = $1", [session.id])
    expect(snapshot.rows[0].history).toEqual(expect.arrayContaining([expect.objectContaining({ player_id: players[0].id, role_corrections: expect.any(Array) })]))
  })
  it('uploads a whole offline night and its raw snapshot, then syncs Undo across the fourth win', async () => {
    const { session } = await setup()
    for (let i = 0; i < 4; i++) await score()
    online(true)
    const result = await flushSyncQueue()
    expect((await cloud.rpc.mock.results.at(-1)?.value)?.error?.message).toBeUndefined()
    expect(result).toMatchObject({ failed: 0 })
    expect(await db.syncQueue.count()).toBe(0)
    expect(await count('goals')).toBe(4)
    expect(await count('sets')).toBe(2)
    const snapshot = await pg.query<{ payload: { games: unknown[]; session_players: { role_at_session: string }[] } }>('select payload from public.session_snapshots')
    expect(snapshot.rows[0].payload.games).toHaveLength(5)
    expect(snapshot.rows[0].payload.session_players.every(p => p.role_at_session === 'SUBSTITUTE')).toBe(true)
    online(false)
    await startGame((await latest()).id)
    await undoLastScoringAction(session.id)
    online(true)
    expect(await flushSyncQueue()).toMatchObject({ failed: 0 })
    expect(await count('sets')).toBe(1)
    expect(await count('games')).toBe(4)
    expect((await pg.query<{ n: number }>('select count(*)::int n from public.goals where deleted_at is null')).rows[0].n).toBe(3)
    expect((await pg.query<{ n: number }>("select jsonb_array_length(payload->'sets') n from public.session_snapshots")).rows[0].n).toBe(1)
  })

  it('rolls back the entire batch on SQL failure, retaining all local changes for retry', async () => {
    await setup()
    const before = await db.syncQueue.count()
    cloud.rpc.mockImplementationOnce((name, args) => rpc(name, { operations: [...args.operations, { id: crypto.randomUUID(), table: 'app_admins', operation: 'upsert', payload: { user_id: outsider } }] }))
    online(true)
    expect(await flushSyncQueue()).toEqual({ synced: 0, failed: before })
    expect(await count('players')).toBe(0)
    expect(await count('sync_operations')).toBe(0)
    expect(await db.syncQueue.count()).toBe(before)
    expect(await flushSyncQueue()).toEqual({ synced: before, failed: 0 })
  })

  it('retries a committed batch after a lost response without replaying old writes or losing new goals', async () => {
    await setup()
    const sent = await db.syncQueue.count()
    cloud.rpc.mockImplementationOnce(async (name, args) => {
      expect((await rpc(name, args)).error).toBeNull()
      return { error: new Error('Lost response'), data: null }
    })
    online(true)
    expect(await flushSyncQueue()).toEqual({ synced: 0, failed: sent })
    online(false)
    await score()
    online(true)
    expect((await flushSyncQueue()).failed).toBe(0)
    expect(await count('players')).toBe(5)
    expect(await count('goals')).toBe(1)
    expect(await db.syncQueue.count()).toBe(0)
  })

  it('preserves a newer row when an already-receipted old operation arrives again', async () => {
    const { players } = await setup()
    const old = toSnakeCase(await db.syncQueue.orderBy('createdAt').toArray()) as unknown[]
    online(true); await flushSyncQueue()
    await pg.query('update public.players set name = $1 where id = $2', ['Newer name', players[0].id])
    expect(await rpc('apply_sync_batch', { operations: old })).toEqual({ data: 0, error: null })
    expect((await pg.query<{ name: string }>('select name from public.players where id = $1', [players[0].id])).rows[0].name).toBe('Newer name')
  })

  it('round-trips a two-team own goal and fractional seconds without inventing an assist', async () => {
    const { session } = await setup(2)
    const game = await latest()
    await startGame(game.id)
    const defender = (await db.setTeamMembers.filter(m => m.teamId === game.challengerTeamId).toArray())[0]
    await recordGoal({ gameId: game.id, teamId: game.holderTeamId, scorerPlayerId: defender.playerId, eventType: 'OWN_GOAL' })
    online(true); await syncCloud()
    const goal = (await db.goals.toArray())[0]
    expect(goal).toMatchObject({ eventType: 'OWN_GOAL', assistPlayerId: null })
    expect((await latest()).waitingTeamId).toBeNull()
    expect((await latest()).holderTeamId).toBe(game.holderTeamId)
    online(false); await undoLastScoringAction(session.id)
    const restored = await latest()
    // Check the precision migration through the real RPC path.
    await db.games.update(restored.id, { remainingSeconds: 167.125 })
    const item = (await db.syncQueue.where('table').equals('games').sortBy('createdAt')).at(-1)!
    await db.syncQueue.update(item.id, { payload: { ...restored, remainingSeconds: 167.125 } })
    online(true); await syncCloud()
    expect((await latest()).remainingSeconds).toBe(167.125)
  })

  it('denies anonymous and non-admin access, including privilege escalation and old views', async () => {
    await setup(); online(true); await flushSyncQueue()
    expect((await rpc('get_sync_state', undefined, outsider)).error).toBeTruthy()
    expect((await rpc('apply_sync_batch', { operations: [] }, outsider)).error).toBeTruthy()
    await pg.transaction(async tx => {
      await tx.exec('set local role authenticated')
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [outsider])
      expect((await tx.query('select * from public.players')).rows).toHaveLength(0)
      expect((await tx.query('select * from public.session_snapshots')).rows).toHaveLength(0)
    })
    for (const query of ['select * from public.players', 'select public.get_sync_state()', 'select * from public.v_season_player_stats']) {
      await expect(pg.transaction(async tx => { await tx.exec('set local role anon'); await tx.exec(query) })).rejects.toThrow()
    }
    await expect(pg.transaction(async tx => { await tx.exec('set local role authenticated'); await tx.query('insert into public.app_admins values ($1)', [outsider]) })).rejects.toThrow()
    await expect(pg.transaction(async tx => { await tx.exec('set local role authenticated'); await tx.exec('select * from public.v_set_team_stats') })).rejects.toThrow()
  })

  it('recovers normalized cloud history on an empty device and pauses its running timer', async () => {
    const { session, players } = await setup()
    await score()
    await setPlayerRole(session.seasonId!, players[0].id, 'REGULAR', '2026-09-08')
    await startGame((await latest()).id)
    online(true); expect((await flushSyncQueue()).failed).toBe(0)
    online(false)
    await db.transaction('rw', db.tables, async () => { for (const t of db.tables) await t.clear() })
    online(true)
    expect((await syncCloud()).pulled).toBeGreaterThan(0)
    online(false)
    await recoverRunningGames(session.id)
    expect((await latest()).status).toBe('paused')
    expect((await db.sessionPlayers.get([session.id, players[0].id]))?.roleAtSession).toBe('SUBSTITUTE')
    expect(await db.goals.count()).toBe(1)
  })

  it('uploads a restored completed set in dependency order with its deferred winning-team reference', async () => {
    await setup()
    for (let i = 0; i < 4; i++) await score()
    const data = Object.fromEntries(await Promise.all(Object.values(syncTables).map(async table => [table.name, await table.toArray()])))
    const file = new File([JSON.stringify({ kind: 'manudagsboltinn-backup', schemaVersion: 1, data })], 'backup.json')
    await restoreBackup(file)
    expect(await db.undoActions.count()).toBe(0)
    online(true)
    expect((await flushSyncQueue()).failed).toBe(0)
    expect(await count('sets')).toBe(2)
    expect(await count('goals')).toBe(4)
    expect(await count('session_snapshots')).toBe(1)
  })
})

describe('local data remains authoritative during network requests', () => {
  it('does not remove new queue entries created while an upload is in flight', async () => {
    await setup()
    cloud.rpc.mockImplementationOnce(async (name, args) => {
      online(false); await score(); online(true)
      return rpc(name, args)
    })
    online(true); await flushSyncQueue()
    expect(await db.syncQueue.count()).toBeGreaterThan(0)
    expect(await count('goals')).toBe(0)
    await flushSyncQueue()
    expect(await count('goals')).toBe(1)
  })

  it('defers an outdated pull if a goal is recorded while downloading', async () => {
    await setup(); online(true); await flushSyncQueue()
    cloud.rpc.mockImplementationOnce(async (name, args) => {
      const response = await rpc(name, args)
      online(false); await score(); online(true)
      return response
    })
    expect(await syncCloud()).toMatchObject({ deferredPull: true, pulled: 0 })
    expect(await db.goals.count()).toBe(1)
  })

  it('defers a pull when Undo deletes a prepared game during the download', async () => {
    const { session } = await setup(); await score(); online(true); await flushSyncQueue()
    cloud.rpc.mockImplementationOnce(async (name, args) => {
      const response = await rpc(name, args)
      online(false); await undoLastScoringAction(session.id); online(true)
      return response
    })
    expect((await syncCloud()).deferredPull).toBe(true)
    expect(await db.games.count()).toBe(1)
    expect((await db.goals.toArray())[0].deletedAt).toBeTruthy()
  })

  it('retains local Undo after an unchanged cloud round trip despite SQL timestamp/key formatting', async () => {
    const { session } = await setup(); await score(); online(true)
    await syncCloud()
    expect(await db.undoActions.count()).toBe(1)
    online(false)
    expect(await undoLastScoringAction(session.id)).toBe(true)
  })

  it('applies cloud deletions atomically and clears stale Undo on another device', async () => {
    const { session } = await setup(); await score(); online(true); await flushSyncQueue()
    const oldState = await readLocalSyncState()
    online(false); await undoLastScoringAction(session.id); online(true); await flushSyncQueue()
    for (const name of Object.keys(syncTables) as (keyof typeof syncTables)[]) {
      await syncTables[name].clear()
      await (syncTables[name] as import('dexie').Table).bulkPut(oldState[name])
    }
    expect(await db.games.count()).toBe(2)
    await syncCloud()
    expect(await db.games.count()).toBe(1)
    expect((await db.goals.toArray())[0].deletedAt).toBeTruthy()
  })

  it('rejects partial or malformed downloads without changing any local rows', async () => {
    await setup(); online(true); await flushSyncQueue()
    const baseline = await readLocalSyncState()
    cloud.rpc.mockResolvedValueOnce({ error: null, data: { schema_version: 1, tables: { players: [] } } })
    await expect(syncCloud()).rejects.toThrow()
    expect(await readLocalSyncState()).toEqual(baseline)
    const malformed = toSnakeCase(baseline) as Record<string, unknown>
    malformed.games = [{}]
    cloud.rpc.mockResolvedValueOnce({ error: null, data: { schema_version: 1, tables: malformed } })
    await expect(syncCloud()).rejects.toBeTruthy()
    expect(await readLocalSyncState()).toEqual(baseline)
  })

  it('does not read or replace local data when offline, signed out or unauthorized', async () => {
    await setup()
    await expect(syncCloud()).rejects.toThrow('netsamband')
    online(true)
    cloud.getSession.mockResolvedValueOnce({ data: { session: null } })
    await expect(syncCloud()).rejects.toThrow('inn')
    cloud.rpc.mockImplementation((name, args) => rpc(name, args, outsider))
    await expect(syncCloud()).rejects.toThrow('mistókst')
    expect(await db.players.count()).toBe(5)
    expect(await count('players')).toBe(0)
  })

  it('never erases existing unqueued local history when connected to an empty project', async () => {
    await setup()
    await db.syncQueue.clear()
    online(true)
    await expect(syncCloud()).rejects.toThrow('tómur')
    expect(await db.players.count()).toBe(5)
    expect(await db.sessions.count()).toBe(1)
  })
})
