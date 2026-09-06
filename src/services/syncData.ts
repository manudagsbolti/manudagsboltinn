import type { Table } from 'dexie'
import { db } from '../db/localDb'

export const syncTables = {
  players: db.players, seasons: db.seasons, player_role_periods: db.rolePeriods,
  sessions: db.sessions, session_players: db.sessionPlayers, session_backfills: db.sessionBackfills,
  sets: db.sets, set_teams: db.setTeams, set_team_members: db.setTeamMembers,
  games: db.games, goals: db.goals, timer_events: db.timerEvents,
} as const
export type SyncState = Record<keyof typeof syncTables, Record<string, unknown>[]>

// Postgres reorders JSON keys and formats timestamps differently. Neither is a
// game change; normalize them before deciding whether local Undo is still valid.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([, v]) => v != null).sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => [k, canonical(v)]))
  if (typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value))) return new Date(value).toISOString()
  return value
}
export function sameRows(a: unknown[], b: unknown[]): boolean {
  const signature = (rows: unknown[]) => JSON.stringify(rows.map(row => JSON.stringify(canonical(row))).sort())
  return signature(a) === signature(b)
}

export async function readLocalSyncState(): Promise<SyncState> {
  const result = {} as SyncState
  for (const name of Object.keys(syncTables) as (keyof SyncState)[]) {
    result[name] = await (syncTables[name] as Table).toArray()
  }
  return result
}

export function toSnakeCase(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toSnakeCase)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
    key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`), toSnakeCase(nested),
  ]))
}

export function fromSnakeCase(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(fromSnakeCase)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
    key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), fromSnakeCase(nested),
  ]))
}

export function parseCloudState(value: unknown): SyncState {
  const envelope = value as { schema_version?: number; tables?: Partial<SyncState> } | null
  if (envelope?.schema_version !== 1 || !envelope.tables) throw new Error('Óstutt gagnasnið úr skýinu. Gögn á tækinu eru óbreytt.')
  const result = {} as SyncState
  for (const name of Object.keys(syncTables) as (keyof SyncState)[]) {
    const rows = envelope.tables[name]
    if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
      throw new Error('Ófullkomin gögn úr skýinu. Gögn á tækinu eru óbreytt.')
    }
    result[name] = rows.map(row => fromSnakeCase(row) as Record<string, unknown>)
  }
  return result
}
