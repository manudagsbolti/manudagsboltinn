import { describe, expect, it } from 'vitest'
import { calculateBackfillPlayerStats } from './stats'
import type { SessionBackfill } from '../domain/types'

describe('aggregate session backfill', () => {
  it('derives known goals and team results without inventing assists or games', () => {
    const backfill: SessionBackfill = {
      sessionId: 'session-1', sourceKind: 'AGGREGATE', assistsRecorded: false,
      teams: [
        { code: 'A', name: 'Rautt', color: '#f00', playerIds: ['p1', 'p2'] },
        { code: 'B', name: 'Blátt', color: '#00f', playerIds: ['p3', 'p4'] },
      ],
      rounds: [
        { roundNo: 1, teamGoals: { A: 4, B: 2 } },
        { roundNo: 2, teamGoals: { A: 3, B: 4 } },
      ],
      playerGoals: [{ playerId: 'p1', goals: 5 }, { playerId: 'p2', goals: 2 }, { playerId: 'p3', goals: 6 }],
      createdAt: '', updatedAt: '',
    }

    const stats = calculateBackfillPlayerStats(backfill)
    expect(stats.find(row => row.playerId === 'p1')).toMatchObject({ goals: 5, assists: 0, miniGames: 0, smallWins: 7, setWins: 1, chokes: 1 })
    expect(stats.find(row => row.playerId === 'p3')).toMatchObject({ goals: 6, smallWins: 6, setWins: 1 })
  })
})
