import { db } from '../db/localDb'
import { supabase } from '../lib/supabase'
import { withSyncLock } from './syncLock'

// Public login identifier only. The shared password is never bundled or saved
// by this app; Supabase Auth verifies it and issues a restricted user session.
export const RECORDER_EMAIL = 'skraning@manudagsboltinn.com'
const CACHE_KEY = 'manudagsboltinn-access'
export interface AppAccess {
  userId: string
  role: 'admin' | 'recorder'
  playedOn?: string | null
  seasonId?: string | null
}

export function cachedAccess(): AppAccess | null {
  try {
    const value = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null')
    return value && typeof value.userId === 'string' && ['admin', 'recorder'].includes(value.role) ? value : null
  } catch { return null }
}

export async function activateAccess(access: AppAccess): Promise<void> {
  await withSyncLock(() => db.transaction('rw', db.tables, async () => {
    const previous = cachedAccess()
    const changed = previous
      ? previous.userId !== access.userId || previous.role !== access.role
        || (access.role === 'recorder' && (previous.playedOn !== access.playedOn || previous.seasonId !== access.seasonId))
      : access.role !== 'admin'
    if (changed) {
      if (await db.syncQueue.count()) throw new Error('Ósendar breytingar eru á tækinu. Samstilltu með fyrri aðgangi áður en skipt er um aðgang eða kvöld.')
      for (const table of db.tables) await table.clear()
    }
  }))
  localStorage.setItem(CACHE_KEY, JSON.stringify(access))
}

export async function loadAccess(expectedRole?: AppAccess['role']): Promise<AppAccess | null> {
  const cached = cachedAccess()
  // Offline access is to previously downloaded facts only. SQL permissions
  // are rechecked on every network request; no cached role grants cloud access.
  if (!navigator.onLine) return cached
  if (!supabase) return null
  const { data: auth } = await supabase.auth.getSession()
  if (!auth.session) return null
  const { data, error } = await supabase.rpc('get_app_access')
  if (error) {
    if (cached?.userId === auth.session.user.id && error.code !== '42501') return cached
    throw new Error('Aðgangur er ekki tilbúinn. Athuga þarf heimildir í uppsetningu kerfisins.')
  }
  if (!data || !['admin', 'recorder'].includes(data.role)) throw new Error('Ógild aðgangsheimild.')
  if (expectedRole && data.role !== expectedRole) throw new Error('Röng aðgangsheimild fyrir þessa innskráningu.')
  const access: AppAccess = { ...data, userId: auth.session.user.id }
  await activateAccess(access)
  return access
}

export async function signOutSafely(): Promise<void> {
  await withSyncLock(async () => {
    if (await db.syncQueue.count()) throw new Error('Samstilltu ósendar breytingar áður en þú skráir þig út.')
    const result = await supabase?.auth.signOut({ scope: 'local' })
    if (result?.error) throw new Error('Útskráning mistókst. Reyndu aftur.')
    await db.transaction('rw', db.tables, async () => { for (const table of db.tables) await table.clear() })
    localStorage.removeItem(CACHE_KEY)
  })
}

export function allowedRoute(role: AppAccess['role'], route: string): boolean {
  return role === 'admin' || ['home', 'new', 'setup', 'live', 'summary'].includes(route)
}
