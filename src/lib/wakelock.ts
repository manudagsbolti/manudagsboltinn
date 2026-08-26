let lock: WakeLockSentinel | null = null

export async function requestWakeLock() {
  try {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return
    if (lock && !lock.released) return
    lock = await navigator.wakeLock.request('screen')
    lock.addEventListener('release', () => { lock = null })
  } catch {
    lock = null
  }
}

export async function releaseWakeLock() {
  try { await lock?.release() } catch { /* noop */ }
  lock = null
}
