import { describe, expect, it } from 'vitest'
import { buildSetTeamStats } from './rules'
import type { Game, SetRecord, SetTeam } from './types'

const now = '2026-08-26T00:00:00Z'
const set: SetRecord = {
  id: 'set-1', sessionId: 'session-1', setNo: 1, status: 'completed', winningTeamId: 'blue', createdAt: now, updatedAt: now,
}
const teams: SetTeam[] = [
  { id: 'red', setId: 'set-1', name: 'Rautt', color: '#f00', sortOrder: 1 },
  { id: 'blue', setId: 'set-1', name: 'Blátt', color: '#00f', sortOrder: 2 },
  { id: 'yellow', setId: 'set-1', name: 'Gult', color: '#ff0', sortOrder: 3 },
]

function wins(teamId: string, count: number, startNo: number): Game[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${teamId}-${index}`,
    setId: 'set-1',
    gameNo: startNo + index,
    holderTeamId: teamId,
    challengerTeamId: teamId === 'red' ? 'blue' : 'red',
    waitingTeamId: 'yellow',
    status: 'completed' as const,
    durationSeconds: 180,
    remainingSeconds: 0,
    endReason: 'goal' as const,
    winningTeamId: teamId,
    exitingTeamId: teamId === 'red' ? 'blue' : 'red',
    createdAt: now,
    updatedAt: now,
  }))
}

describe('set statistics', () => {
  it('detects a choke at 3 points and a zero-point set', () => {
    const games = [
      ...wins('red', 12, 1),
      ...wins('blue', 16, 20),
    ]
    const stats = buildSetTeamStats(set, teams, games, { winsPerPoint: 4, pointsToWinSet: 4 })
    expect(stats.find((x) => x.teamId === 'red')).toMatchObject({ points: 3, isChoke: true })
    expect(stats.find((x) => x.teamId === 'blue')).toMatchObject({ points: 4, isWinner: true })
    expect(stats.find((x) => x.teamId === 'yellow')).toMatchObject({ points: 0, isZeroPointSet: true })
  })
})
