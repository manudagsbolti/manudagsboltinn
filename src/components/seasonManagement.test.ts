// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { db } from '../db/localDb'
import { addPlayer, saveSeason, setPlayerRole } from '../data/repository'
import { SeasonsScreen } from './SeasonsScreen'
import { PlayersScreen } from './PlayersScreen'
import { SubmitNight } from './SubmitNight'
import { NewSessionScreen } from './NewSessionScreen'

let root: Root
let host: HTMLDivElement
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  await db.transaction('rw', db.tables, async () => { for (const t of db.tables) await t.clear() })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
async function waitFor(check: () => void) {
  for (let i = 0; i < 40; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 25)) })
    try { check(); return } catch (e) { if (i === 39) throw e }
  }
}
const button = (text: string) => [...host.querySelectorAll('button')].find(b => b.textContent?.includes(text))!
it.each([false,true])('selects all regulars independently of substitutes (recorder=%s)', async recorder => {
  const season = await saveSeason({ name:'Haust',startsOn:'2026-09-01',endsOn:'2026-12-31' })
  const anna = await addPlayer('Anna'), ari = await addPlayer('Ari'), bara = await addPlayer('Bára')
  await setPlayerRole(season.id,anna.id,'REGULAR','2026-09-01')
  await setPlayerRole(season.id,ari.id,'REGULAR','2026-09-01')
  await db.ratingCache.put({id:season.id,season,ratings:{},rolePeriods:await db.rolePeriods.toArray(),fetchedAt:'2026-09-07'})
  await act(async () => root.render(createElement(NewSessionScreen,{recorder,recordingDate:'2026-09-07',onCreated:vi.fn(),onCancel:vi.fn()})))
  await waitFor(() => expect(host.querySelector('#attendance-regular')).not.toBeNull())
  expect(host.querySelector('[aria-labelledby="attendance-substitute"]')?.textContent).toContain('Bára')
  await act(async () => button('Bára').click())
  await act(async () => button('Velja alla fastamenn').click())
  expect(host.querySelectorAll('.attendance-player[aria-pressed="true"]')).toHaveLength(3)
  await act(async () => button('Afvelja alla fastamenn').click())
  expect(host.querySelectorAll('.attendance-player[aria-pressed="true"]')).toHaveLength(1)
  expect(button('Bára').getAttribute('aria-pressed')).toBe('true')
})
it('lets a recorder choose the day without season settings and queues completed nights explicitly', async () => {
  await act(async () => root.render(createElement(NewSessionScreen, { recorder:true,onCreated:vi.fn(),onCancel:vi.fn() })))
  expect(host.querySelector('input[type=date]')).toBeTruthy()
  expect(host.querySelector('select')).toBeNull()
  expect(host.querySelector('[aria-label="Tímabil annar"]')).toBeNull()
  await db.sessions.add({id:'test-night',playedOn:'2026-08-31',status:'completed',gameDurationSeconds:180,winsPerPoint:1,pointsToWinSet:4,createdAt:'',updatedAt:''})
  await act(async () => root.render(createElement(SubmitNight, { sessionId:'test-night' })))
  await waitFor(() => expect(button('Senda til yfirferðar')).toBeTruthy())
  await act(async () => button('Senda til yfirferðar').click())
  await waitFor(() => expect(host.textContent).toContain('Bíður sendingar á tækinu'))
  expect((await db.submissions.get('test-night'))?.state).toBe('queued')
  expect(button('Senda til yfirferðar')).toBeUndefined()
})
it('opens the saved custom range, not the default September range, and flags outside nights', async () => {
  const season = await saveSeason({ name: 'Haustpróf', startsOn: '2026-08-31', endsOn: '2026-12-31' })
  await db.sessions.add({ id: 'night', seasonId: season.id, playedOn: '2026-08-24', status: 'completed', gameDurationSeconds: 180, winsPerPoint: 1, pointsToWinSet: 4, createdAt: '', updatedAt: '' })
  await act(async () => root.render(createElement(SeasonsScreen, { onOpen: vi.fn() })))
  await waitFor(() => expect(button('Haustpróf')).toBeTruthy())
  await act(async () => button('Haustpróf').click())
  await waitFor(() => expect((host.querySelector('input[type=date]') as HTMLInputElement).value).toBe('2026-08-31'))
  expect(host.textContent).toContain('Kvöldið er utan tímabils annarinnar.')
  expect(button('Breyta dagsetningu')).toBeTruthy()
})
it('distinguishes displayed role from the change action and cancellation leaves the role untouched', async () => {
  await saveSeason({ name: 'Prófönn', startsOn: '2020-01-01', endsOn: '2099-12-31' })
  await addPlayer('Ari')
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  await act(async () => root.render(createElement(PlayersScreen)))
  await waitFor(() => expect(host.textContent).toContain('V · Varamaður'))
  await act(async () => button('Gera að fastamanni').click())
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Ari: breyta í fastamann'))
  expect(await db.rolePeriods.count()).toBe(0)
  confirm.mockReturnValue(true)
  await act(async () => button('Gera að fastamanni').click())
  await waitFor(() => expect(host.textContent).toContain('F · Fastamaður'))
  expect(button('Gera að varamanni')).toBeTruthy()
})
