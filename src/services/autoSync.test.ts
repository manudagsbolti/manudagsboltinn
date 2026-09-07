// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { startAutoSync } from './autoSync'

const mocks = vi.hoisted(() => ({ flush: vi.fn(), auth: vi.fn(), unsubscribe: vi.fn() }))
vi.mock('./syncQueue', () => ({ flushSyncQueue: mocks.flush }))
vi.mock('../lib/supabase', () => ({ supabase: { auth: { onAuthStateChange: mocks.auth } } }))
afterEach(() => { vi.useRealTimers() })

it('retries pending uploads on startup, reconnect, sign-in and interval; cleans up on unmount', async () => {
  vi.useFakeTimers()
  mocks.flush.mockResolvedValue({ synced: 0, failed: 0 })
  mocks.auth.mockReturnValue({ data: { subscription: { unsubscribe: mocks.unsubscribe } } })
  const stop = startAutoSync()
  expect(mocks.flush).toHaveBeenCalledTimes(1)
  window.dispatchEvent(new Event('online'))
  expect(mocks.flush).toHaveBeenCalledTimes(2)
  mocks.auth.mock.calls[0][0]()
  await Promise.resolve()
  expect(mocks.flush).toHaveBeenCalledTimes(3)
  vi.advanceTimersByTime(30_000)
  expect(mocks.flush).toHaveBeenCalledTimes(4)
  stop()
  window.dispatchEvent(new Event('online'))
  vi.advanceTimersByTime(30_000)
  expect(mocks.flush).toHaveBeenCalledTimes(4)
  expect(mocks.unsubscribe).toHaveBeenCalledOnce()
})
