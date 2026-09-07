import { describe, expect, it } from 'vitest'
import { assignmentBalance, seasonStartYearForDate, seasonWindow, weightedRandomAssignments } from './seasonAnalytics'

describe('season analytics helpers', () => {
  it('uses Aug-Jul seasons', () => {
    expect(seasonStartYearForDate('2026-08-31')).toBe(2026)
    expect(seasonStartYearForDate('2027-01-12')).toBe(2026)
    expect(seasonWindow(2026).name).toBe('2026/27')
  })

  it('weighted random keeps team sizes balanced and strength close', () => {
    const ids = ['a','b','c','d','e','f']
    const ratings = new Map([['a',130],['b',125],['c',105],['d',95],['e',75],['f',70]])
    const result = weightedRandomAssignments(ids, 3, ratings)
    const counts = [0,1,2].map(team => Object.values(result).filter(value => value === team).length)
    expect(counts).toEqual([2,2,2])
    expect(assignmentBalance(result,3,ratings)).toBeGreaterThanOrEqual(80)
  })
})
