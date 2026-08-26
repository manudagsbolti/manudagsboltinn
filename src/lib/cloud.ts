import { createClient, type Session as AuthSession, type SupabaseClient } from '@supabase/supabase-js'
import type { AppState, Session, TeamCode } from '../domain/types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined

let client: SupabaseClient | null = null

export function cloudConfigured() {
  return Boolean(url && key && !url.includes('YOUR_PROJECT'))
}

export function supabase(): SupabaseClient | null {
  if (!cloudConfigured()) return null
  if (!client) client = createClient(url!, key!, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
  return client
}

export async function getAuthSession(): Promise<AuthSession | null> {
  const db = supabase()
  if (!db) return null
  const { data } = await db.auth.getSession()
  return data.session
}

export async function signIn(email: string, password: string) {
  const db = supabase()
  if (!db) throw new Error('Supabase er ekki stillt í .env.local.')
  const { data, error } = await db.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.session
}

export async function signOut() {
  const db = supabase()
  if (!db) return
  const { error } = await db.auth.signOut()
  if (error) throw error
}

function iso(ms: number | null) {
  return ms ? new Date(ms).toISOString() : null
}

function teamId(session: Session, code: TeamCode | null) {
  if (!code) return null
  return session.teams.find((t) => t.code === code)?.id ?? null
}

async function upsertOrThrow(db: SupabaseClient, table: string, rows: Record<string, unknown>[], onConflict = 'id') {
  if (!rows.length) return
  const { error } = await db.from(table).upsert(rows, { onConflict })
  if (error) throw new Error(`${table}: ${error.message}`)
}

async function syncOneSession(db: SupabaseClient, session: Session, deviceId: string) {
  await upsertOrThrow(db, 'sessions', [{
    id: session.id,
    season_id: session.seasonId,
    session_date: session.sessionDate,
    team_count: session.teamCount,
    game_duration_seconds: session.gameDurationSeconds,
    wins_required: session.winsRequired,
    status: session.status,
    started_at: iso(session.startedAt),
    ended_at: iso(session.endedAt),
    created_at: iso(session.createdAt),
    updated_at: iso(session.updatedAt),
  }])

  await upsertOrThrow(db, 'session_teams', session.teams.map((t) => ({
    id: t.id, session_id: session.id, team_code: t.code,
  })))

  await upsertOrThrow(db, 'session_players', session.players.map((p) => ({
    id: p.id,
    session_id: session.id,
    player_id: p.playerId,
    team_id: teamId(session, p.teamCode),
    role_at_session: p.roleAtSession,
    present: p.present,
  })))

  const completedSetRows = session.completedSets.map((s) => ({
    id: s.id,
    session_id: session.id,
    sequence_number: s.setNumber,
    winner_team_id: teamId(session, s.winnerTeam),
    final_wins: s.finalWins,
    ended_at: iso(s.wonAt),
  }))
  const currentSetRow = {
    id: session.currentSetId,
    session_id: session.id,
    sequence_number: session.setNumber,
    winner_team_id: null,
    final_wins: session.setWins,
    ended_at: null,
  }
  await upsertOrThrow(db, 'point_races', [...completedSetRows, currentSetRow])

  const gameRows: any[] = session.miniGames.map((g) => ({
    id: g.id,
    point_race_id: g.setId,
    sequence_number: g.sequenceNumber,
    team_1_id: teamId(session, g.team1),
    team_2_id: teamId(session, g.team2),
    waiting_team_id: teamId(session, g.waitingTeam),
    incumbent_team_id: teamId(session, g.incumbentTeam),
    winner_team_id: teamId(session, g.winnerTeam),
    outgoing_team_id: teamId(session, g.outgoingTeam),
    incoming_team_id: teamId(session, g.incomingTeam),
    end_reason: g.endReason,
    status: 'FINISHED',
    started_at: iso(g.startedAt),
    ended_at: iso(g.endedAt),
  }))

  if (session.status === 'ACTIVE') {
    const g = session.activeGame
    gameRows.push({
      id: g.id,
      point_race_id: g.setId,
      sequence_number: g.sequenceNumber,
      team_1_id: teamId(session, g.team1),
      team_2_id: teamId(session, g.team2),
      waiting_team_id: teamId(session, g.waitingTeam),
      incumbent_team_id: teamId(session, g.incumbentTeam),
      winner_team_id: null,
      outgoing_team_id: null,
      incoming_team_id: null,
      end_reason: null as any,
      status: g.status,
      started_at: iso(g.startedAt),
      ended_at: null,
    })
  }
  await upsertOrThrow(db, 'mini_games', gameRows)

  await upsertOrThrow(db, 'game_events', session.goals.map((g) => ({
    id: g.id,
    mini_game_id: g.miniGameId,
    event_type: g.type,
    scoring_team_id: teamId(session, g.scoringTeam),
    scorer_player_id: g.scorerId,
    assist_player_id: g.assistId,
    occurred_at: iso(g.createdAt),
  })))

  await upsertOrThrow(db, 'timer_events', session.timerEvents.map((e) => ({
    id: e.id,
    mini_game_id: e.miniGameId,
    event_type: e.type,
    occurred_at: iso(e.timestamp),
  })))

  await upsertOrThrow(db, 'session_snapshots', [{
    session_id: session.id,
    payload: session,
    device_id: deviceId,
    updated_at: iso(session.updatedAt),
  }], 'session_id')
}

export async function pushAllToCloud(state: AppState) {
  const db = supabase()
  if (!db) throw new Error('Supabase er ekki stillt.')
  const auth = await getAuthSession()
  if (!auth) throw new Error('Þú þarft að skrá þig inn áður en gögn eru syncuð.')

  await upsertOrThrow(db, 'players', state.players.map((p) => ({
    id: p.id, name: p.name, nickname: p.nickname, active: p.active,
    created_at: iso(p.createdAt), updated_at: iso(p.updatedAt),
  })))
  await upsertOrThrow(db, 'seasons', state.seasons.map((s) => ({
    id: s.id, name: s.name, start_date: s.startDate, end_date: s.endDate,
    status: s.status, created_at: iso(s.createdAt), updated_at: iso(s.updatedAt),
  })))
  await upsertOrThrow(db, 'player_role_periods', state.rolePeriods.map((p) => ({
    id: p.id, season_id: p.seasonId, player_id: p.playerId, role: p.role,
    valid_from: p.validFrom, valid_to: p.validTo,
    created_at: iso(p.createdAt), updated_at: iso(p.updatedAt),
  })))

  for (const session of state.sessions) await syncOneSession(db, session, state.sync.deviceId)
}

export async function pullFromCloud(local: AppState): Promise<AppState> {
  const db = supabase()
  if (!db) throw new Error('Supabase er ekki stillt.')
  const auth = await getAuthSession()
  if (!auth) throw new Error('Þú þarft að skrá þig inn.')

  const [playersRes, seasonsRes, rolesRes, snapshotsRes] = await Promise.all([
    db.from('players').select('*'),
    db.from('seasons').select('*'),
    db.from('player_role_periods').select('*'),
    db.from('session_snapshots').select('session_id,payload,updated_at'),
  ])
  for (const result of [playersRes, seasonsRes, rolesRes, snapshotsRes]) {
    if (result.error) throw result.error
  }

  const players = (playersRes.data ?? []).map((p: any) => ({
    id: p.id, name: p.name, nickname: p.nickname, active: p.active,
    createdAt: Date.parse(p.created_at), updatedAt: Date.parse(p.updated_at),
  }))
  const seasons = (seasonsRes.data ?? []).map((s: any) => ({
    id: s.id, name: s.name, startDate: s.start_date, endDate: s.end_date, status: s.status,
    createdAt: Date.parse(s.created_at), updatedAt: Date.parse(s.updated_at),
  }))
  const rolePeriods = (rolesRes.data ?? []).map((p: any) => ({
    id: p.id, seasonId: p.season_id, playerId: p.player_id, role: p.role,
    validFrom: p.valid_from, validTo: p.valid_to,
    createdAt: Date.parse(p.created_at), updatedAt: Date.parse(p.updated_at),
  }))
  const cloudSessions: Session[] = (snapshotsRes.data ?? []).map((r: any) => r.payload as Session)

  const mergedSessions = new Map<string, Session>()
  for (const s of local.sessions) mergedSessions.set(s.id, s)
  for (const s of cloudSessions) {
    const existing = mergedSessions.get(s.id)
    if (!existing || s.updatedAt > existing.updatedAt) mergedSessions.set(s.id, s)
  }

  const activeSessionId = local.activeSessionId && mergedSessions.get(local.activeSessionId)?.status === 'ACTIVE'
    ? local.activeSessionId
    : null

  const mergeUpdated = <T extends { id: string; updatedAt: number }>(localRows: T[], cloudRows: T[]) => {
    const map = new Map<string, T>()
    for (const row of localRows) map.set(row.id, row)
    for (const row of cloudRows) {
      const existing = map.get(row.id)
      if (!existing || row.updatedAt > existing.updatedAt) map.set(row.id, row)
    }
    return [...map.values()]
  }

  const mergedPlayers = mergeUpdated(local.players, players)
  const mergedSeasons = mergeUpdated(local.seasons, seasons)
  const mergedRoles = mergeUpdated(local.rolePeriods, rolePeriods)

  return {
    ...local,
    players: mergedPlayers,
    seasons: mergedSeasons,
    rolePeriods: mergedRoles,
    sessions: [...mergedSessions.values()].sort((a, b) => b.sessionDate.localeCompare(a.sessionDate)),
    activeSessionId,
    selectedSeasonId: local.selectedSeasonId ?? mergedSeasons.find((s) => s.status === 'ACTIVE')?.id ?? mergedSeasons[0]?.id ?? null,
    sync: { ...local.sync, pending: false, lastError: null, lastSyncAt: Date.now() },
    updatedAt: Date.now(),
  }
}
