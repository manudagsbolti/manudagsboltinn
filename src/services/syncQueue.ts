import { db, type SyncQueueItem } from '../db/localDb'
import { supabase } from '../lib/supabase'

const CONFLICT_KEYS: Record<SyncQueueItem['table'], string> = {
  players: 'id', seasons: 'id', sessions: 'id', session_players: 'session_id,player_id', sets: 'id',
  set_teams: 'id', set_team_members: 'team_id,player_id', games: 'id', goals: 'id',
}

export async function enqueueSync(item: Omit<SyncQueueItem, 'attempts'>): Promise<void> {
  await db.syncQueue.put({ ...item, attempts: 0 })
  void flushSyncQueue()
}

export async function flushSyncQueue(): Promise<{ synced: number; failed: number }> {
  if (!supabase || !navigator.onLine) return { synced: 0, failed: 0 }
  const { data: auth } = await supabase.auth.getSession()
  if (!auth.session) return { synced: 0, failed: 0 }

  const items = await db.syncQueue.orderBy('createdAt').toArray()
  let synced = 0
  let failed = 0

  for (const item of items) {
    try {
      const { error } = await supabase.from(item.table).upsert(toSnakeCase(item.payload), {
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
