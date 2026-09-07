import { supabase } from '../lib/supabase'
import { flushSyncQueue } from './syncQueue'

// Retry uploads on reconnect/sign-in and periodically after transient failures.
// Downloads remain explicit, so another device never changes a live screen.
export function startAutoSync(): () => void {
  if (!supabase) return () => undefined
  const retry = () => { void flushSyncQueue().catch(() => undefined) }
  const visible = () => { if (document.visibilityState === 'visible') retry() }
  window.addEventListener('online', retry)
  document.addEventListener('visibilitychange', visible)
  // Do not invoke async Supabase methods inside the Auth callback itself.
  const { data } = supabase.auth.onAuthStateChange(() => { queueMicrotask(retry) })
  const interval = window.setInterval(retry, 30_000)
  retry()
  return () => {
    window.removeEventListener('online', retry)
    document.removeEventListener('visibilitychange', visible)
    data.subscription.unsubscribe()
    window.clearInterval(interval)
  }
}
