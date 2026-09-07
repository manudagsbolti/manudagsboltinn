// Cloud work is serialized; local recording never acquires this lock.
let tail: Promise<unknown> = Promise.resolve()
export function withSyncLock<T>(work: () => Promise<T>): Promise<T> {
  const next = tail.then(() => typeof navigator !== 'undefined' && navigator.locks
    ? navigator.locks.request('manudagsboltinn-cloud', work)
    : work())
  tail = next.catch(() => undefined)
  return next
}
