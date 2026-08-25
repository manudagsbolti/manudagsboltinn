let wakeLock: any = null

export async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await (navigator as any).wakeLock.request('screen')
    }
  } catch {
    // Wake lock is best-effort; the live game must never depend on it.
  }
}

export async function releaseWakeLock() {
  try {
    await wakeLock?.release?.()
  } catch {
    // no-op
  } finally {
    wakeLock = null
  }
}
