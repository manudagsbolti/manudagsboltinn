// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { db } from '../db/localDb'
import { activateAccess, allowedRoute, cachedAccess, loadAccess, signOutSafely } from './access'

const auth = vi.hoisted(() => ({ rpc: vi.fn(), getSession: vi.fn(), signOut: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: { rpc: auth.rpc, auth } }))
const admin = { userId: 'admin', role: 'admin' as const }
const recorder = { userId: 'recorder', role: 'recorder' as const, playedOn: '2026-09-07', seasonId: 'season' }
beforeEach(async () => {
  localStorage.clear()
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  await db.transaction('rw', db.tables, async () => { for (const t of db.tables) await t.clear() })
  auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'recorder' } } } })
  auth.rpc.mockReset().mockResolvedValue({ data: recorder, error: null })
  auth.signOut.mockReset().mockResolvedValue({ error: null })
})
async function seed() {
  await db.seasons.put({ id: 'private-season', name: 'Hidden history', startsOn: '2025-01-01', isActive: false })
  await db.syncQueue.put({ id: 'pending', table: 'seasons', entityId: 'private-season', operation: 'upsert', payload: {}, createdAt: '2026-09-07', attempts: 0 })
}

it('preserves the existing local admin database on first authenticated admin use', async () => {
  await seed(); await activateAccess(admin)
  expect(await db.seasons.count()).toBe(1)
  expect(await db.syncQueue.count()).toBe(1)
})
it('blocks switching away from unsent data and purges admin history before a recorder enters', async () => {
  await seed(); await activateAccess(admin)
  await expect(activateAccess(recorder)).rejects.toThrow('Ósendar')
  expect(cachedAccess()?.role).toBe('admin')
  expect(await db.seasons.count()).toBe(1)
  await db.syncQueue.clear(); await activateAccess(recorder)
  expect(await db.seasons.count()).toBe(0)
  expect(cachedAccess()).toEqual(recorder)
})
it('preserves current-night offline data on reopen and protects it when the window changes', async () => {
  await activateAccess(recorder); await seed()
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
  expect(await loadAccess()).toEqual(recorder)
  expect(auth.rpc).not.toHaveBeenCalled()
  await activateAccess(recorder)
  expect(await db.seasons.count()).toBe(1)
  await expect(activateAccess({ ...recorder, playedOn: '2026-09-14' })).rejects.toThrow('Ósendar')
})
it('never treats a cached role as permission to bypass a server denial or an expected role', async () => {
  await activateAccess(recorder)
  auth.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501' } })
  await expect(loadAccess()).rejects.toThrow('heimildir')
  await expect(loadAccess('admin')).rejects.toThrow('Röng')
})
it('blocks logout with unsent events, then clears local facts and the cached role after logout', async () => {
  await activateAccess(admin); await seed()
  await expect(signOutSafely()).rejects.toThrow('ósendar')
  expect(auth.signOut).not.toHaveBeenCalled()
  await db.syncQueue.clear(); await signOutSafely()
  expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  expect(await db.seasons.count()).toBe(0)
  expect(cachedAccess()).toBeNull()
})
it('blocks direct hash routes to season statistics, admin, history import and presentation', () => {
  for (const route of ['stats', 'players', 'cloud', 'manual', 'presentation']) expect(allowedRoute('recorder', route)).toBe(false)
  for (const route of ['home', 'new', 'setup', 'live', 'summary']) expect(allowedRoute('recorder', route)).toBe(true)
  expect(allowedRoute('admin', 'stats')).toBe(true)
})
