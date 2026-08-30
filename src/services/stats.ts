import type { AllTimePlayerStats, Game, Goal, PlayerSessionStats, SetRecord, SetTeam, SetTeamMember, UUID } from '../domain/types'
import { buildSetTeamStats } from '../domain/rules'

export function calculateSessionPlayerStats(input: {
  playerIds: UUID[]
  sets: SetRecord[]
  teams: SetTeam[]
  memberships: SetTeamMember[]
  games: Game[]
  goals: Goal[]
  winsPerPoint: number
  pointsToWinSet: number
}): PlayerSessionStats[] {
  const result = new Map<UUID, PlayerSessionStats>()
  for (const playerId of input.playerIds) {
    result.set(playerId, { playerId, points: 0, smallWins: 0, setsPlayed: 0, goals: 0, assists: 0, setWins: 0, chokes: 0, zeroPointSets: 0, nixDay: false })
  }
  for (const set of input.sets) {
    const teams = input.teams.filter((team) => team.setId === set.id)
    const games = input.games.filter((game) => game.setId === set.id)
    const teamStats = buildSetTeamStats(set, teams, games, input)
    for (const team of teamStats) {
      const members = input.memberships.filter((membership) => membership.teamId === team.teamId)
      for (const membership of members) {
        const stats = result.get(membership.playerId)
        if (!stats) continue
        stats.points += team.points
        stats.smallWins += team.smallWins
        stats.setsPlayed++
        if (team.isWinner) stats.setWins++
        if (team.isChoke) stats.chokes++
        if (team.isZeroPointSet) stats.zeroPointSets++
      }
    }
  }
  for (const goal of input.goals) {
    if (goal.deletedAt) continue
    result.get(goal.scorerPlayerId)!.goals++
    if (goal.assistPlayerId && result.has(goal.assistPlayerId)) result.get(goal.assistPlayerId)!.assists++
  }
  for (const stats of result.values()) stats.nixDay = input.sets.some((s) => s.status === 'completed') && stats.points === 0
  return [...result.values()]
}

export function emptyAllTime(playerId: UUID): AllTimePlayerStats {
  return { playerId, sessions: 0, points: 0, smallWins: 0, setsPlayed: 0, goals: 0, assists: 0, setWins: 0, chokes: 0, zeroPointSets: 0, nixDay: false, nixDays: 0 }
}
