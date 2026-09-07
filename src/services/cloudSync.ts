import type { Table } from 'dexie'
import { db } from '../db/localDb'
import { supabase } from '../lib/supabase'
import { flushSyncQueueUnlocked } from './syncQueue'
import { withSyncLock } from './syncLock'
import { usesSubmissions } from './access'
import { cacheRecorderRatings } from './recorderRatings'
import { fromSnakeCase, parseCloudState, readLocalSyncState, sameRows, syncTables, type SyncState } from './syncData'

export function syncCloud(): Promise<{ pushed: number; pulled: number; deferredPull: boolean }> {
  return withSyncLock(async () => {
    if (!supabase) throw new Error('Supabase er ekki stillt í .env.local')
    if (!navigator.onLine) throw new Error('Ekkert netsamband. Gögn eru örugg á tækinu.')
    const { data, error } = await supabase.auth.getSession()
    if (error || !data.session) throw new Error('Skráðu þig inn áður en þú samstillir.')
    const pushed = await flushSyncQueueUnlocked()
    if (pushed.failed) throw new Error('Samstilling mistókst. Breytingar bíða áfram á tækinu.')
    if (usesSubmissions()) {
      const response = await supabase.rpc('get_submission_roster')
      if (response.error || !Array.isArray(response.data)) throw new Error('Ekki tókst að sækja leikmannalista.')
      // Merge only missing roster entries. Never replace local nights or players
      // while an offline recording is in progress.
      await db.transaction('rw', db.players, async () => {
        for (const raw of response.data) {
          const player = fromSnakeCase(raw) as import('../domain/types').Player
          if (!await db.players.get(player.id)) await db.players.add(player)
        }
      })
      const ratingResponse = await supabase.rpc('get_submission_ratings')
      if (ratingResponse.error) throw new Error('Leikmenn sóttir en styrkleikamat náðist ekki. Eldra mat helst á tækinu; athugaðu migration 013.')
      await cacheRecorderRatings(ratingResponse.data)
      return { pushed: pushed.synced, pulled: response.data.length, deferredPull: false }
    }
    const baseline = await db.transaction('r', db.tables, readLocalSyncState)
    // One database statement gives a consistent view, including cloud deletes.
    const response = await supabase.rpc('get_sync_state')
    if (response.error) throw new Error('Ekki tókst að sækja gögn. Athugaðu uppsetningu og stjórnandaaðgang í Supabase.')
    const incoming = parseCloudState(response.data)
    return db.transaction('rw', db.tables, async () => {
      // Recording continues during network requests. Compare and import in one
      // local transaction; a changed row OR a queued delete defers the pull.
      const current = await readLocalSyncState()
      if (await db.syncQueue.count() || JSON.stringify(current) !== JSON.stringify(baseline)) {
        return { pushed: pushed.synced, pulled: 0, deferredPull: true }
      }
      if (Object.values(incoming).every(rows => rows.length === 0)
        && Object.values(current).some(rows => rows.length > 0)) {
        throw new Error('Skýjagrunnurinn er tómur. Local gögn voru varðveitt. Export og Restore backup setur þau aftur í sendingarbiðröð.')
      }
      let pulled = 0
      for (const name of Object.keys(syncTables) as (keyof SyncState)[]) {
        const table = syncTables[name] as Table
        await table.clear()
        await table.bulkPut(incoming[name])
        pulled += incoming[name].length
      }
      // Keep original-device Undo only when the game's facts are unchanged.
      const changed = !sameRows(current.games, incoming.games)
        || !sameRows(current.sets, incoming.sets)
        || !sameRows(current.goals, incoming.goals)
      if (changed) await db.undoActions.clear()
      return { pushed: pushed.synced, pulled, deferredPull: false }
    })
  })
}
