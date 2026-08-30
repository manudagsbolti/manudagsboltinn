import type { Game, UUID } from './types'

export interface Rotation {
  holderTeamId: UUID
  challengerTeamId: UUID
  waitingTeamId: UUID | null
}

export function nextRotation(game: Game): Rotation {
  if (!game.waitingTeamId) {
    const holderTeamId = game.endReason === 'goal' && game.winningTeamId
      ? game.winningTeamId
      : game.challengerTeamId
    const challengerTeamId = holderTeamId === game.holderTeamId
      ? game.challengerTeamId
      : game.holderTeamId
    return { holderTeamId, challengerTeamId, waitingTeamId: null }
  }

  if (game.endReason === 'goal' && game.winningTeamId && game.exitingTeamId) {
    return {
      holderTeamId: game.winningTeamId,
      challengerTeamId: game.waitingTeamId,
      waitingTeamId: game.exitingTeamId,
    }
  }

  return {
    holderTeamId: game.challengerTeamId,
    challengerTeamId: game.waitingTeamId,
    waitingTeamId: game.holderTeamId,
  }
}
