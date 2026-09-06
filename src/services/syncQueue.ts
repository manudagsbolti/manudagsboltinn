import { db, type SyncQueueItem } from '../db/localDb'
import { supabase } from '../lib/supabase'

const CONFLICT_KEYS: Record<SyncQueueItem['table'], string> = {
  players: 'id', seasons: 'id', sessions: 'id', session_players: 'session_id,player_id', sets: 'id',
  player_role_periods: 'id', session_backfills: 'session_id', set_teams: 'id', set_team_members: 'team_id,player_id', games: 'id', goals: 'id', timer_events: 'id',
}

export async function enqueueSync(item: Omit<SyncQueueItem, 'attempts'>): Promise<void> {
  const last = await db.syncQueue.orderBy('createdAt').last()
  const createdAt = new Date(Math.max(Date.parse(item.createdAt), last ? Date.parse(last.createdAt) + 1 : 0)).toISOString()
  await db.syncQueue.put({ ...item, createdAt, attempts: 0 })
}

let inFlight: Promise<{ synced: number; failed: number }> | null = null
export function flushSyncQueue(): Promise<{ synced: number; failed: number }> {
  if (!inFlight) inFlight = flush().finally(() => { inFlight = null })
  return inFlight
}

async function flush(): Promise<{ synced: number; failed: number }> {
  if (!supabase || !navigator.onLine) return { synced: 0, failed: 0 }
  const { data: auth } = await supabase.auth.getSession()
  if (!auth.session) return { synced: 0, failed: 0 }

  const items = await db.syncQueue.orderBy('createdAt').toArray()
  let synced = 0
  let failed = 0

  for (const item of items) {
    try {
      const { error } = item.operation === 'delete'
        ? await supabase.from(item.table).delete().eq('id', item.entityId)
        : await supabase.from(item.table).upsert(toSnakeCase(item.payload) as Record<string, unknown>, {
        onConflict: CONFLICT_KEYS[item.table],
      })
      if (error) throw error
      await db.syncQueue.delete(item.id)
      synced++
    } catch (error) {
      failed++
      await db.syncQueue.update(item.id, {
        attempts: item.attempts + 1,
        lastError: error instanceof Error ? error.message : String(error),
      })
      break // Preserve dependency and undo ordering on retry.
    }
  }
  return { synced, failed }
}

function toSnakeCase(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toSnakeCase)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
    key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), toSnakeCase(nested),
  ]))
}
