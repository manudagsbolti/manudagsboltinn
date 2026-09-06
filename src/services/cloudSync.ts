import { db } from '../db/localDb'
import { supabase } from '../lib/supabase'
import { flushSyncQueue } from './syncQueue'

const TABLES = [
  ['players', db.players], ['seasons', db.seasons], ['player_role_periods', db.rolePeriods], ['sessions', db.sessions], ['session_players', db.sessionPlayers],
  ['session_backfills', db.sessionBackfills],
  ['sets', db.sets], ['set_teams', db.setTeams], ['set_team_members', db.setTeamMembers], ['games', db.games], ['goals', db.goals], ['timer_events', db.timerEvents],
] as const

export async function syncCloud(): Promise<{ pushed: number; pulled: number }> {
  if (!supabase) throw new Error('Supabase er ekki stillt í .env.local')
  const pushedResult = await flushSyncQueue()
  if (pushedResult.failed > 0) throw new Error(`${pushedResult.failed} breytingar gátu ekki farið í cloud. Local gögn voru ekki yfirskrifuð.`)
  let pulled = 0
  for (const [table, dexieTable] of TABLES) {
    const { data, error } = await supabase.from(table).select('*')
    if (error) throw error
    if (data?.length) {
      const rows = data.map(fromSnakeCase)
      await (dexieTable as any).bulkPut(rows)
      pulled += rows.length
    }
  }
  return { pushed: pushedResult.synced, pulled }
}

function fromSnakeCase(value: any): any {
  if (Array.isArray(value)) return value.map(fromSnakeCase)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
    key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), fromSnakeCase(nested),
  ]))
}
