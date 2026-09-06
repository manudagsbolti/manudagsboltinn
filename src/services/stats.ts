import type { AllTimePlayerStats, Game, Goal, PlayerSessionStats, SessionBackfill, SetRecord, SetTeam, SetTeamMember, UUID } from '../domain/types'
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
    result.set(playerId, { playerId, miniGames: 0, points: 0, smallWins: 0, setsPlayed: 0, goals: 0, assists: 0, ownGoals: 0, setWins: 0, chokes: 0, zeroPointSets: 0, nixDay: false })
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
        stats.miniGames += games.filter(game => game.status === 'completed' && (game.holderTeamId === team.teamId || game.challengerTeamId === team.teamId)).length
        if (set.status === 'completed' || games.some(game => game.startedAt)) stats.setsPlayed++
        if (team.isWinner) stats.setWins++
        if (team.isChoke) stats.chokes++
        if (team.isZeroPointSet) stats.zeroPointSets++
      }
    }
  }
  for (const goal of input.goals) {
    if (goal.deletedAt) continue
    const scorer = result.get(goal.scorerPlayerId)
    if (goal.eventType === 'OWN_GOAL') {
      if (scorer) scorer.ownGoals++
    } else if (scorer) scorer.goals++
    if (goal.assistPlayerId && result.has(goal.assistPlayerId)) result.get(goal.assistPlayerId)!.assists++
  }
  for (const stats of result.values()) stats.nixDay = input.sets.some((s) => s.status === 'completed') && stats.points === 0
  return [...result.values()]
}

export function emptyAllTime(playerId: UUID): AllTimePlayerStats {
  return { playerId, sessions: 0, miniGames: 0, points: 0, smallWins: 0, setsPlayed: 0, goals: 0, assists: 0, ownGoals: 0, setWins: 0, chokes: 0, zeroPointSets: 0, nixDay: false, nixDays: 0 }
}

export function calculateBackfillPlayerStats(backfill: SessionBackfill): PlayerSessionStats[] {
  const completedRounds = backfill.rounds.length
  return backfill.teams.flatMap(team => team.playerIds.map(playerId => {
    const smallWins = backfill.rounds.reduce((sum, round) => sum + (round.teamGoals[team.code] ?? 0), 0)
    let setWins = 0, chokes = 0, zeroPointSets = 0
    for (const round of backfill.rounds) {
      const score = round.teamGoals[team.code] ?? 0
      const highest = Math.max(...backfill.teams.map(candidate => round.teamGoals[candidate.code] ?? 0))
      const leaders = backfill.teams.filter(candidate => (round.teamGoals[candidate.code] ?? 0) === highest)
      const winner = highest >= 4 && leaders.length === 1 && leaders[0].code === team.code
      if (winner) setWins++
      else if (score === 3) chokes++
      if (!winner && score === 0) zeroPointSets++
    }
    return {
      playerId, miniGames: 0, points: smallWins, smallWins, setsPlayed: completedRounds,
      goals: backfill.playerGoals.find(row => row.playerId === playerId)?.goals ?? 0,
      assists: 0, ownGoals: 0, setWins, chokes, zeroPointSets, nixDay: smallWins === 0,
    }
  }))
}
