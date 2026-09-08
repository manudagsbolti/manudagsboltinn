import type { Game, Goal, SetRecord, Session } from './types'

// Corrections preserve recorded matchups and set boundaries. First to the
// configured target in recorded game order wins; later facts are not replayed.
export function correctedSet(set: SetRecord, games: Game[], session: Session, closed: boolean): SetRecord {
  const wins = new Map<string, number>()
  let winner: string | null = null
  for (const game of [...games].sort((a, b) => a.gameNo - b.gameNo)) {
    if (game.status !== 'completed' || !game.winningTeamId) continue
    const total = (wins.get(game.winningTeamId) ?? 0) + 1
    wins.set(game.winningTeamId, total)
    if (!winner && total >= session.winsPerPoint * session.pointsToWinSet) winner = game.winningTeamId
  }
  return { ...set, winningTeamId: winner, status: winner || closed ? 'completed' : 'live' }
}

export function historyResult(game: Game, goals: Goal[], teamName: (id: string) => string, playerName: (id: string) => string): string {
  if (game.endReason === 'timeout') return 'Jafntefli · tíminn rann út'
  const goal = goals.find(g => g.gameId === game.id && !g.deletedAt)
  return `${game.winningTeamId ? teamName(game.winningTeamId) : 'Óskráð úrslit'}${goal ? ` · ${playerName(goal.scorerPlayerId)}${goal.eventType === 'OWN_GOAL' ? ' (sjálfsmark)' : ''}${goal.assistPlayerId ? ` · stoð: ${playerName(goal.assistPlayerId)}` : goal.assistsRecorded === false ? ' · stoðsending ekki skráð' : ''}` : ''}`
}

export function gamesAfterTarget(games: Game[], session: Session): number {
  const completed = [...games].filter(g=>g.status==='completed').sort((a,b)=>a.gameNo-b.gameNo)
  const wins = new Map<string, number>()
  for (const [i, game] of completed.entries()) {
    if (!game.winningTeamId) continue
    const total = (wins.get(game.winningTeamId) ?? 0) + 1
    wins.set(game.winningTeamId, total)
    if (total >= session.winsPerPoint * session.pointsToWinSet) return completed.length-i-1
  }
  return 0
}
