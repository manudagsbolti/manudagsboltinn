// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AccessGate } from './AccessGate'
import App from '../App'
import { db } from '../db/localDb'
import { RECORDER_EMAIL } from '../services/access'

const mock = vi.hoisted(() => ({ load: vi.fn(), login: vi.fn(), stats: vi.fn() }))
vi.mock('../services/access', async original => ({ ...await original<object>(), loadAccess: mock.load }))
vi.mock('../services/autoSync', () => ({ startAutoSync: () => () => undefined }))
vi.mock('../services/cloudSync', () => ({ syncCloud: async () => ({ pushed: 0, pulled: 0 }) }))
vi.mock('../lib/supabase', () => ({ supabase: { auth: { signInWithPassword: mock.login } }, hasSupabaseConfig: true }))
vi.mock('./StatsScreen', () => ({ StatsScreen: mock.stats }))
let root: Root
let container: HTMLDivElement
beforeEach(async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear(); location.hash = '#/home'
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false }) })
  await db.transaction('rw', db.tables, async () => { for (const t of db.tables) await t.clear() })
  mock.load.mockReset().mockResolvedValue(null)
  mock.login.mockReset().mockResolvedValue({ error: null })
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })
const recorder = { userId: 'recorder', role: 'recorder', playedOn: '2026-09-07', seasonId: 'season' }

it('shows only a shared-password field, authenticates with the fixed recorder identity, and clears the password', async () => {
  await act(async () => root.render(createElement(AccessGate, { children: access => createElement('p', null, `Opened ${access.role}`) })))
  expect(container.querySelector('input[type=email]')).toBeNull()
  const input = container.querySelector('input[type=password]') as HTMLInputElement
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'test-password')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  mock.load.mockResolvedValue(recorder)
  await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
  expect(mock.login).toHaveBeenCalledWith({ email: RECORDER_EMAIL, password: 'test-password' })
  expect(mock.load).toHaveBeenLastCalledWith('recorder')
  expect(container.textContent).toContain('Opened recorder')
  expect(container.querySelector('input[type=password]')).toBeNull()
})
it('has a separate administrator login and never opens after a wrong password', async () => {
  await act(async () => root.render(createElement(AccessGate, { children: () => createElement('p', null, 'PRIVATE') })))
  await act(async () => { (container.querySelector('button[type=button]') as HTMLButtonElement).click() })
  expect(container.querySelector('input[type=email]')).not.toBeNull()
  mock.login.mockResolvedValue({ error: { message: 'invalid' } })
  await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
  expect(container.textContent).not.toContain('PRIVATE')
  expect(container.querySelector('[role=alert]')).not.toBeNull()
})
it('routes a recorder away from a direct statistics URL without rendering statistics or admin navigation', async () => {
  location.hash = '#/stats'
  mock.load.mockResolvedValue(recorder)
  await act(async () => { root.render(createElement(App)); await new Promise(resolve => setTimeout(resolve, 20)) })
  expect(container.textContent).toContain('Skráning kvöldsins')
  expect(mock.stats).not.toHaveBeenCalled()
  expect(container.querySelector('nav[aria-label="Aðalleiðsögn"]')).toBeNull()
})
