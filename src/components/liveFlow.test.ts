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
import { TeamSetupScreen } from './TeamSetupScreen'

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
it('offers weighted drawing to recorders using cached season ratings offline', async () => {
  const players = []
  for (const name of ['Anna','Ari','Bára','Bjarni']) players.push(await addPlayer(name))
  const session = await createSession({playedOn:'2026-09-07',playerIds:players.map(p=>p.id),...DEFAULT_RULES})
  const season = (await db.seasons.toArray())[0]
  await db.ratingCache.put({id:season.id,season,ratings:Object.fromEntries(players.map((p,i)=>[p.id,80+i*15])),fetchedAt:'2026-09-07T12:00:00Z'})
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  await act(async () => root.render(createElement(TeamSetupScreen,{sessionId:session.id,recorder:true,onReady:vi.fn(),onCancel:vi.fn()})))
  await waitFor(() => expect(button('Full random')?.classList.contains('selected')).toBe(true))
  await click('Weighted random')
  await waitFor(() => expect(host.textContent).toContain('R 125'))
  expect(button('Weighted random')).toBeDefined()
  expect(host.textContent).toContain('Virkar án nets')
  await click('SKIPTA Í LIÐ')
  await waitFor(() => expect(button('Byrja Sett')).toBeDefined())
  expect(host.querySelectorAll('.assignment-player')).toHaveLength(4)
})
it('edits the selected group in place and can cancel without leaving setup', async () => {
  const players = []
  for (const name of ['Anna', 'Ari', 'Bára', 'Bjarni', 'Cecilia']) players.push(await addPlayer(name))
  const session = await createSession({ playedOn: '2026-09-07', playerIds: players.slice(0,4).map(p => p.id), ...DEFAULT_RULES })
  const onCancel = vi.fn()
  await act(async () => root.render(createElement(TeamSetupScreen, { sessionId: session.id, onReady: vi.fn(), onCancel })))
  await waitFor(() => expect(button('Breyta hópnum')).toBeDefined())
  await click('Breyta hópnum')
  await waitFor(() => expect(button('Cecilia')).toBeDefined())
  await click('Anna'); await click('Cecilia')
  await click('Hætta við breytingar')
  expect((await db.sessionPlayers.toArray()).map(p => p.playerId)).toContain(players[0].id)
  await click('Breyta hópnum')
  await waitFor(() => expect(button('Cecilia')).toBeDefined())
  await click('Anna'); await click('Cecilia'); await click('Áfram')
  await waitFor(() => expect(host.querySelector('.roster-list')?.textContent).toContain('Cecilia'))
  expect(host.querySelector('.roster-list')?.textContent).not.toContain('Anna')
  expect(await db.sessions.toArray()).toEqual([session])
  expect(onCancel).not.toHaveBeenCalled()
})
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

it('records an own goal and distinguishes the scorer from the benefiting team in the overview', async () => {
  await mount()
  await click('STARTA LEIK')
  await waitFor(() => expect(button('Ⅱ PÁSA')).toBeDefined())
  await click('Rautt')
  await waitFor(() => expect(button('Skrá sjálfsmark')).toBeDefined())
  expect(button('Skrá sjálfsmark').classList.contains('own-goal-toggle')).toBe(true)
  await click('Skrá sjálfsmark')
  expect(host.querySelector('.own-goal-toggle')?.getAttribute('aria-pressed')).toBe('true')
  await click('Bára')
  await click('Vista sjálfsmark')
  await waitFor(() => expect(host.querySelector('.own-goal-badge')?.textContent).toBe('1 sjálfsmark'))
  const cards = [...host.querySelectorAll('.summary-team')]
  const red = cards.find(c => c.querySelector('h3')?.textContent?.includes('Rautt'))!
  const blue = cards.find(c => c.querySelector('h3')?.textContent?.includes('Blátt'))!
  expect(red.querySelector('.own-goal-note')?.textContent).toContain('1 sjálfsmark andstæðinga')
  expect(blue.querySelector('.own-goal-badge')?.parentElement?.textContent).toContain('Bára')
  expect(blue.querySelector('.own-goal-badge')?.closest('li')?.querySelector('strong')?.textContent).toContain('0')
  expect((await db.goals.toArray())[0]).toMatchObject({eventType:'OWN_GOAL',assistPlayerId:null})
})

it('requires two-step deletion, preserves a cancelled live night, and keeps the roster', async () => {
  const { session } = await mount()
  await click('STARTA LEIK')
  await waitFor(() => expect(button('Ⅱ PÁSA')).toBeDefined())
  await click('Eyða kvöldi')
  await waitFor(() => expect(host.querySelector('.delete-night-dialog')).not.toBeNull())
  expect((await db.games.toArray())[0].status).toBe('paused')
  expect(button('Staðfesta eyðingu').disabled).toBe(true)
  await click('Hætta við')
  expect(await db.sessions.get(session.id)).toBeDefined()
  expect(await db.games.count()).toBe(1)
  await click('Eyða kvöldi')
  await waitFor(() => expect(host.querySelector('.delete-night-dialog input')).not.toBeNull())
  await act(async () => {
    const input = host.querySelector<HTMLInputElement>('.delete-night-dialog input')!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'EYÐA')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await click('Staðfesta eyðingu')
  await waitFor(() => expect(host.querySelector('.delete-night-dialog')).toBeNull())
  expect(await db.sessions.get(session.id)).toBeUndefined()
  expect(await db.games.count()).toBe(0)
  expect(await db.players.count()).toBe(4)
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
  expect(host.querySelector('[aria-label="Rautt: 1 unnin sett í kvöld"]')?.textContent).toBe('★')
  expect(host.querySelector('[aria-label="Blátt: 0 unnin sett í kvöld"]')?.textContent).toBe('')
  await click('Afturkalla síðasta leik')
  await waitFor(() => expect(button('HALDA ÁFRAM')).toBeDefined())
  expect([...host.querySelectorAll('.score-team strong')].map(t=>t.textContent)).toEqual(['3','0'])
  expect(host.querySelectorAll('.set-win-stars span')).toHaveLength(0)
  expect(await db.sets.count()).toBe(1)
  expect(host.querySelector('[aria-label="Sett 2"]')).toBeNull()
  expect([...host.querySelectorAll('[aria-label="Sett 1"] tbody td')].map(t => t.textContent)).toEqual(['3', '3 / 4', '0', '0 / 4'])
})
