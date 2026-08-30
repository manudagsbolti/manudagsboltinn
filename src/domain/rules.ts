import type { Game, SetRecord, SetTeam, TeamSetStats, UUID } from './types'

export interface RuleConfig {
  gameDurationSeconds: number
  winsPerPoint: number
  pointsToWinSet: number
}

export const DEFAULT_RULES: RuleConfig = {
  gameDurationSeconds: 180,
  winsPerPoint: 4,
  pointsToWinSet: 4,
}

export function pointsFromSmallWins(smallWins: number, winsPerPoint: number): number {
  return Math.floor(smallWins / winsPerPoint)
}

export function progressWins(smallWins: number, winsPerPoint: number): number {
  return smallWins % winsPerPoint
}

export function buildSetTeamStats(
  set: SetRecord,
  teams: SetTeam[],
  games: Game[],
  config: Pick<RuleConfig, 'winsPerPoint' | 'pointsToWinSet'>,
): TeamSetStats[] {
  const wins = new Map<UUID, number>()
  for (const game of games) {
    if (game.status !== 'completed' || !game.winningTeamId) continue
    wins.set(game.winningTeamId, (wins.get(game.winningTeamId) ?? 0) + 1)
  }

  return teams.map((team) => {
    const smallWins = wins.get(team.id) ?? 0
    const points = pointsFromSmallWins(smallWins, config.winsPerPoint)
    const isWinner = set.winningTeamId === team.id
    return {
      teamId: team.id,
      smallWins,
      points,
      progressWins: progressWins(smallWins, config.winsPerPoint),
      isWinner,
      isChoke: set.status === 'completed' && !isWinner && points === config.pointsToWinSet - 1,
      isZeroPointSet: set.status === 'completed' && points === 0,
    }
  })
}

export function getSetWinner(
  games: Game[],
  teams: SetTeam[],
  config: Pick<RuleConfig, 'winsPerPoint' | 'pointsToWinSet'>,
): UUID | null {
  const placeholderSet: SetRecord = {
    id: 'calculation', sessionId: 'calculation', setNo: 0, status: 'live',
    winningTeamId: null, createdAt: '', updatedAt: '',
  }
  return buildSetTeamStats(placeholderSet, teams, games, config)
    .find((team) => team.points >= config.pointsToWinSet)?.teamId ?? null
}

export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.ceil(totalSeconds))
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

export function currentRemainingSeconds(game: Game, now = Date.now()): number {
  if (game.status !== 'live' || !game.timerStartedAt) return game.remainingSeconds
  const elapsed = Math.floor((now - new Date(game.timerStartedAt).getTime()) / 1000)
  return Math.max(0, game.remainingSeconds - elapsed)
}
