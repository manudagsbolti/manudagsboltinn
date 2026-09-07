// @vitest-environment jsdom
import { createElement, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { db } from '../db/localDb'
import { addPlayer, createSession, createSet } from '../data/repository'
import { DEFAULT_RULES } from '../domain/rules'
import { playBuzzer } from '../lib/sound'
import { LiveSessionScreen } from './LiveSessionScreen'
import { SessionSummaryScreen } from './SessionSummaryScreen'

vi.mock('../lib/sound', () => ({ playBuzzer: vi.fn(async () => {}), unlockAudio: vi.fn(async () => {}) }))
vi.mock('../lib/wakelock', () => ({ requestWakeLock: vi.fn(async () => {}), releaseWakeLock: vi.fn(async () => {}) }))
let root: Root
let host: HTMLDivElement
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  await db.open()
  await db.transaction('rw', db.tables, async () => { for (const t of db.tables) await t.clear() })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const button = (text: string) => [...host.querySelectorAll('button')].find(b => b.textContent?.includes(text))!
async function click(text: string) { await act(async () => { button(text).click() }) }
async function waitFor(check: () => void) {
  for (let attempt = 0; attempt < 40; attempt++) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)) })
    try { check(); return } catch (error) { if (attempt === 39) throw error }
  }
}
async function mount(teamCount = 2) {
  const names = ['Anna', 'Ari', 'Bára', 'Bjarni', 'Cecilia', 'Carl'].slice(0, teamCount*2)
  const players: Awaited<ReturnType<typeof addPlayer>>[] = []
  for (const name of names) players.push(await addPlayer(name))
  const session = await createSession({playedOn:'2026-09-07',playerIds:players.map(p => p.id),...DEFAULT_RULES})
  await createSet(session.id, Array.from({length:teamCount}, (_, i) => ({name:['Rautt','Blátt','Gult'][i],color:'#fff',playerIds:players.slice(i*2,i*2+2).map(p=>p.id)})))
  const onFinish = vi.fn()
  await act(async () => root.render(createElement(LiveSessionScreen,{sessionId:session.id,onFinish,onBack:vi.fn(),onReshuffle:vi.fn()})))
  await waitFor(() => expect(button('STARTA LEIK')).toBeDefined())
  return {session,onFinish}
}

it('pauses before scorer selection, saves assist, shows READY, then finishes into a complete summary', async () => {
  const {session,onFinish} = await mount()
  await click('STARTA LEIK')
  await waitFor(() => expect(button('Ⅱ PÁSA')).toBeDefined())
  await click('Rautt')
  await waitFor(() => expect(host.querySelector('[role="dialog"]')).not.toBeNull())
  expect((await db.games.toArray()).find(g => g.status === 'paused')).toBeDefined()
  await click('Anna')
  await click('Ari')
  await waitFor(() => expect(button('STARTA LEIK')).toBeDefined())
  expect(host.querySelector('[role="timer"]')?.textContent).toBe('03:00')
  vi.spyOn(window,'confirm').mockReturnValue(true)
  await click('Klára kvöldið')
  await waitFor(() => expect(onFinish).toHaveBeenCalledOnce())
  await act(async () => root.render(createElement(SessionSummaryScreen,{sessionId:session.id,onBack:vi.fn()})))
  await waitFor(() => expect(host.querySelectorAll('.summary-table tbody tr')).toHaveLength(4))
  const headings = [...host.querySelectorAll('.summary-table thead th')].map(t=>t.textContent)
  expect(headings).toEqual(['Leikmaður','Lið','Staða','Leikir','Sigrar','Jafntefli','Sett','Mörk','Stoðs.','G+A','Sjálfsm.'])
  expect(host.textContent).toContain('KVÖLDINU LOKIÐ')
  expect(host.textContent).toContain('1 leikir')
  expect(host.textContent).toContain('Varamaður')
})

it('cancelling finish preserves the live session with a paused timer', async () => {
  const {session,onFinish} = await mount()
  await click('STARTA LEIK')
  await waitFor(() => expect(button('Ⅱ PÁSA')).toBeDefined())
  vi.spyOn(window,'confirm').mockReturnValue(false)
  await click('Klára kvöldið')
  expect((await db.sessions.get(session.id))?.status).toBe('live')
  expect((await db.games.toArray())[0].status).toBe('paused')
  expect(onFinish).not.toHaveBeenCalled()
})

it('buzzes on first timeout, asks for outgoing team, then prepares READY without a win', async () => {
  await mount(3)
  await click('STARTA LEIK')
  await waitFor(() => expect(button('Ⅱ PÁSA')).toBeDefined())
  const game = (await db.games.toArray())[0]
  vi.useFakeTimers({toFake:['Date']})
  vi.setSystemTime(Date.parse(game.timerStartedAt!) + 180_000)
  await waitFor(() => expect(host.textContent).toContain('Hvort liðið fer út?'))
  expect(playBuzzer).toHaveBeenCalledOnce()
  await act(async () => { host.querySelector<HTMLButtonElement>('.timeout-team-choices button')!.click() })
  await waitFor(() => expect(button('STARTA LEIK')).toBeDefined())
  expect(host.querySelector('[role="timer"]')?.textContent).toBe('03:00')
  expect((await db.games.get(game.id))?.winningTeamId).toBeNull()
  const next = (await db.games.toArray()).find(g=>g.status==='ready')!
  expect(next.waitingTeamId).toBe(game.holderTeamId)
  expect([...host.querySelectorAll('.summary-numbers div')].filter(d => d.querySelector('dt')?.textContent === 'Jafntefli').map(d => d.querySelector('dd')?.textContent)).toEqual(['1','1','0'])
})

it('fourth goal resets the scoreboard and Undo restores the winning set transaction', async () => {
  await mount()
  for(let n=0;n<4;n++) {
    await click('STARTA LEIK')
    await waitFor(() => expect(button('Ⅱ PÁSA')).toBeDefined())
    await click('Rautt')
    await waitFor(() => expect(button('Anna')).toBeDefined())
    await click('Anna'); await click('Engin')
    await waitFor(() => expect(button('STARTA LEIK')).toBeDefined())
  }
  expect(host.textContent).toContain('vann sett 1')
  const completedSet = host.querySelector('[aria-label="Sett 1"]')!
  expect([...completedSet.querySelectorAll('tbody td')].map(t => t.textContent)).toEqual(['4', '4 / 4', '0', '0 / 4'])
  const nextSet = host.querySelector('[aria-label="Sett 2"]')!
  expect(nextSet.textContent).toContain('Nýtt sett · tilbúið')
  expect([...nextSet.querySelectorAll('tbody td')].map(t => t.textContent)).toEqual(['0', '0 / 4', '0', '0 / 4'])
  expect([...host.querySelectorAll('.night-team-roster li')].find(r => r.textContent?.includes('Anna'))?.textContent).toContain('4')
  expect(host.textContent).not.toContain('Unnin sett')
  const anna = [...host.querySelectorAll('.summary-table tbody tr')].find(r => r.textContent?.includes('Anna'))!
  expect(anna.querySelector('td')?.textContent).toBe('1')
  expect([...host.querySelectorAll('.score-team strong')].map(t=>t.textContent)).toEqual(['0','0'])
  await click('Afturkalla síðasta leik')
  await waitFor(() => expect(button('HALDA ÁFRAM')).toBeDefined())
  expect([...host.querySelectorAll('.score-team strong')].map(t=>t.textContent)).toEqual(['3','0'])
  expect(await db.sets.count()).toBe(1)
  expect(host.querySelector('[aria-label="Sett 2"]')).toBeNull()
  expect([...host.querySelectorAll('[aria-label="Sett 1"] tbody td')].map(t => t.textContent)).toEqual(['3', '3 / 4', '0', '0 / 4'])
})
