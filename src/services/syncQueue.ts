import { db, type SyncQueueItem } from '../db/localDb'
import { supabase } from '../lib/supabase'
import { withSyncLock } from './syncLock'
import { toSnakeCase } from './syncData'

export async function enqueueSync(item: Omit<SyncQueueItem, 'attempts'>): Promise<void> {
  const last = await db.syncQueue.orderBy('createdAt').last()
  const createdAt = new Date(Math.max(Date.parse(item.createdAt), last ? Date.parse(last.createdAt) + 1 : 0)).toISOString()
  await db.syncQueue.put({ ...item, createdAt, attempts: 0 })
}

let inFlight: Promise<{ synced: number; failed: number }> | null = null
export function flushSyncQueue(): Promise<{ synced: number; failed: number }> {
  if (!supabase || !navigator.onLine) return Promise.resolve({ synced: 0, failed: 0 })
  if (!inFlight) inFlight = withSyncLock(flushSyncQueueUnlocked).finally(() => { inFlight = null })
  return inFlight
}

// Call only while holding the cloud lock. The server commits the whole batch
// and recovery snapshots, or none of it. Receipt IDs make lost replies safe.
export async function flushSyncQueueUnlocked(): Promise<{ synced: number; failed: number }> {
  if (!supabase || !navigator.onLine) return { synced: 0, failed: 0 }
  const { data: auth, error: authError } = await supabase.auth.getSession()
  if (authError || !auth.session) return { synced: 0, failed: 0 }
  const items = await db.syncQueue.orderBy('createdAt').toArray()
  if (!items.length) return { synced: 0, failed: 0 }
  try {
    const { error } = await supabase.rpc('apply_sync_batch', {
      operations: items.map(item => toSnakeCase({
        id: item.id, table: item.table, entityId: item.entityId,
        operation: item.operation, payload: item.payload,
      })),
    })
    if (error) throw error
    // Never clear changes created while this batch was travelling.
    await db.syncQueue.bulkDelete(items.map(item => item.id))
    return { synced: items.length, failed: 0 }
  } catch {
    await db.transaction('rw', db.syncQueue, async () => {
      for (const item of items) await db.syncQueue.update(item.id, {
        attempts: item.attempts + 1,
        lastError: 'Samstilling mistókst. Gögn eru örugg á tækinu; athugaðu net, aðgang og Supabase uppsetningu.',
      })
    })
    return { synced: 0, failed: items.length }
  }
}
