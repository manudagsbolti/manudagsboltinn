import type { Game, UUID } from './types'

export interface Rotation {
  holderTeamId: UUID
  challengerTeamId: UUID
  waitingTeamId: UUID | null
}

export function nextRotation(game: Game, selectedOutgoingTeamId?: UUID): Rotation {
  if (!game.waitingTeamId) {
    return { holderTeamId: game.holderTeamId, challengerTeamId: game.challengerTeamId, waitingTeamId: null }
  }

  if (game.endReason === 'goal' && game.winningTeamId && game.exitingTeamId) {
    return {
      holderTeamId: game.winningTeamId,
      challengerTeamId: game.waitingTeamId,
      waitingTeamId: game.exitingTeamId,
    }
  }

  const outgoing = selectedOutgoingTeamId ?? game.exitingTeamId ?? game.incumbentTeamId
  if (!outgoing || (outgoing !== game.holderTeamId && outgoing !== game.challengerTeamId)) {
    throw new Error('Velja þarf liðið sem fer út')
  }
  const staying = outgoing === game.holderTeamId ? game.challengerTeamId : game.holderTeamId
  return { holderTeamId: staying, challengerTeamId: game.waitingTeamId, waitingTeamId: outgoing }
}
