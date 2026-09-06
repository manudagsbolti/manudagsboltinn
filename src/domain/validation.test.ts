import { describe, expect, it } from 'vitest'
import { validateTeams } from './validation'
import { defaultSeasonForDate, validateSeason } from './seasons'
import { currentRemainingSeconds, formatClock } from './rules'
import type { Game } from './types'

describe('V1 domain boundaries', () => {
  it.each([[], [{playerIds:['a']}], [{playerIds:['a']},{playerIds:[]}], [{playerIds:['a']},{playerIds:['a']}], [{playerIds:['a']},{playerIds:['x']}]])('rejects invalid attendance/team assignment %j', (...teams) => {
    expect(() => validateTeams(teams, ['a','b'])).toThrow()
  })
  it('derives time from timestamps, clamps expiry and rounds only the display', () => {
    const game = { status:'live', remainingSeconds:180, timerStartedAt:'2026-09-07T20:00:00Z' } as Game
    const start = Date.parse(game.timerStartedAt!)
    expect(currentRemainingSeconds(game,start-1000)).toBe(180)
    expect(currentRemainingSeconds(game,start+179_750)).toBe(.25)
    expect(formatClock(.25)).toBe('00:01')
    expect(currentRemainingSeconds(game,start+999_000)).toBe(0)
    expect(formatClock(-1)).toBe('00:00')
    expect(formatClock(180)).toBe('03:00')
  })
  it('defaults to September–December and January–April, with summer off', () => {
    expect(defaultSeasonForDate('2026-09-01')).toMatchObject({startsOn:'2026-09-01',endsOn:'2026-12-31'})
    expect(defaultSeasonForDate('2027-04-30')).toMatchObject({startsOn:'2027-01-01',endsOn:'2027-04-30'})
    expect(defaultSeasonForDate('2027-05-01')).toBeNull()
    expect(defaultSeasonForDate('2027-08-31')).toBeNull()
  })
  it('allows explicit custom dates but rejects invalid or reversed dates', () => {
    expect(() => validateSeason({name:'Summer',startsOn:'2027-05-01',endsOn:'2027-08-31'})).not.toThrow()
    expect(() => validateSeason({name:'',startsOn:'2027-05-01',endsOn:'2027-08-31'})).toThrow()
    expect(() => validateSeason({name:'X',startsOn:'2027-09-01',endsOn:'2027-08-31'})).toThrow()
    expect(() => validateSeason({name:'X',startsOn:'2027-02-30',endsOn:'2027-08-31'})).toThrow()
  })
})
