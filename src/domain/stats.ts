import type {
  AppState,
  PairStats,
  PlayerRole,
  PlayerSessionStats,
  SeasonPlayerStats,
  Session,
  TeamCode,
  TeamSessionStats,
} from './types'
import { roleAtDate } from './roles'

function playerName(state: AppState, playerId: string) {
  return state.players.find((p) => p.id === playerId)?.name ?? 'Óþekktur'
}

function teamPlayedGame(session: Session, team: TeamCode, game: Session['miniGames'][number]) {
  return game.team1 === team || game.team2 === team
}

function chokeForTeam(session: Session, team: TeamCode) {
  return session.completedSets.filter((s) => s.winnerTeam !== team && s.finalWins[team] === session.winsRequired - 1).length
}

function nixForTeam(session: Session, team: TeamCode) {
  return session.completedSets.filter((s) => s.winnerTeam !== team && s.finalWins[team] === 0).length
}

export function teamSessionStats(session: Session): TeamSessionStats[] {
  return session.teams.map(({ code }) => {
    const games = session.miniGames.filter((g) => teamPlayedGame(session, code, g))
    const wins = games.filter((g) => g.winnerTeam === code).length
    const goals = session.goals.filter((g) => g.scoringTeam === code).length
    return {
      teamCode: code,
      players: session.players.filter((p) => p.present && p.teamCode === code).length,
      miniGames: games.length,
      wins,
      sets: session.sessionSets[code],
      goals,
      chokes: chokeForTeam(session, code),
      nix: nixForTeam(session, code),
      winPct: games.length ? wins / games.length : 0,
    }
  })
}

export function playerSessionStats(state: AppState, session: Session): PlayerSessionStats[] {
  return session.players.filter((p) => p.present).map((sp) => {
    const games = session.miniGames.filter((g) => teamPlayedGame(session, sp.teamCode, g))
    const wins = games.filter((g) => g.winnerTeam === sp.teamCode).length
    const goals = session.goals.filter((g) => g.type === 'GOAL' && g.scorerId === sp.playerId).length
    const ownGoals = session.goals.filter((g) => g.type === 'OWN_GOAL' && g.scorerId === sp.playerId).length
    const assists = session.goals.filter((g) => g.assistId === sp.playerId).length
    return {
      playerId: sp.playerId,
      playerName: playerName(state, sp.playerId),
      teamCode: sp.teamCode,
      roleAtSession: sp.roleAtSession,
      miniGames: games.length,
      wins,
      sets: session.sessionSets[sp.teamCode],
      goals,
      assists,
      goalContributions: goals + assists,
      ownGoals,
      chokes: chokeForTeam(session, sp.teamCode),
      nix: nixForTeam(session, sp.teamCode),
      winPct: games.length ? wins / games.length : 0,
    }
  }).sort((a, b) => b.sets - a.sets || b.wins - a.wins || b.goalContributions - a.goalContributions)
}

export function seasonPlayerStats(
  state: AppState,
  seasonId: string,
  filter: PlayerRole | 'ALL' = 'REGULAR',
): SeasonPlayerStats[] {
  const relevant = state.sessions.filter((s) => s.seasonId === seasonId && s.status !== 'DRAFT')
  const map = new Map<string, SeasonPlayerStats>()

  for (const session of relevant) {
    for (const row of playerSessionStats(state, session)) {
      if (filter !== 'ALL' && row.roleAtSession !== filter) continue
      const current = map.get(row.playerId) ?? {
        playerId: row.playerId,
        playerName: row.playerName,
        appearances: 0,
        eligibleSessions: 0,
        attendancePct: 0,
        miniGames: 0,
        wins: 0,
        sets: 0,
        goals: 0,
        assists: 0,
        goalContributions: 0,
        ownGoals: 0,
        chokes: 0,
        nix: 0,
        winPct: 0,
      }
      current.appearances += 1
      current.miniGames += row.miniGames
      current.wins += row.wins
      current.sets += row.sets
      current.goals += row.goals
      current.assists += row.assists
      current.goalContributions += row.goalContributions
      current.ownGoals += row.ownGoals
      current.chokes += row.chokes
      current.nix += row.nix
      current.winPct = current.miniGames ? current.wins / current.miniGames : 0
      map.set(row.playerId, current)
    }
  }

  if (filter === 'REGULAR') {
    const season = state.seasons.find((s) => s.id === seasonId)
    if (season) {
      for (const player of state.players) {
        const eligibleSessions = relevant.filter((session) => roleAtDate(state.rolePeriods, seasonId, player.id, session.sessionDate) === 'REGULAR').length
        const everRegular = state.rolePeriods.some((period) => period.seasonId === seasonId && period.playerId === player.id && period.role === 'REGULAR' && period.validFrom <= season.endDate && (!period.validTo || period.validTo >= season.startDate))
        if (!everRegular && eligibleSessions === 0) continue
        const current = map.get(player.id) ?? {
          playerId: player.id, playerName: player.name, appearances: 0, eligibleSessions: 0, attendancePct: 0,
          miniGames: 0, wins: 0, sets: 0, goals: 0, assists: 0, goalContributions: 0, ownGoals: 0, chokes: 0, nix: 0, winPct: 0,
        }
        current.eligibleSessions = eligibleSessions
        current.attendancePct = eligibleSessions ? current.appearances / eligibleSessions : 0
        map.set(player.id, current)
      }
    }
  } else {
    for (const current of map.values()) {
      current.eligibleSessions = current.appearances
      current.attendancePct = 1
    }
  }

  return [...map.values()].sort((a, b) =>
    b.sets - a.sets || b.winPct - a.winPct || b.wins - a.wins || b.goalContributions - a.goalContributions,
  )
}

export function pairStats(state: AppState, seasonId: string, filter: PlayerRole | 'ALL' = 'REGULAR'): PairStats[] {
  const sessions = state.sessions.filter((s) => s.seasonId === seasonId && s.status !== 'DRAFT')
  const map = new Map<string, PairStats>()

  for (const session of sessions) {
    for (const team of session.teams) {
      const members = session.players.filter((p) => p.present && p.teamCode === team.code && (filter === 'ALL' || p.roleAtSession === filter))
      const teamGames = session.miniGames.filter((g) => teamPlayedGame(session, team.code, g))
      const wins = teamGames.filter((g) => g.winnerTeam === team.code).length
      const sets = session.sessionSets[team.code]

      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          const ids = [members[i].playerId, members[j].playerId].sort()
          const key = ids.join(':')
          const current = map.get(key) ?? {
            key,
            player1Id: ids[0],
            player2Id: ids[1],
            player1Name: playerName(state, ids[0]),
            player2Name: playerName(state, ids[1]),
            appearancesTogether: 0,
            miniGames: 0,
            wins: 0,
            sets: 0,
            winPct: 0,
          }
          current.appearancesTogether += 1
          current.miniGames += teamGames.length
          current.wins += wins
          current.sets += sets
          current.winPct = current.miniGames ? current.wins / current.miniGames : 0
          map.set(key, current)
        }
      }
    }
  }

  return [...map.values()].sort((a, b) => b.winPct - a.winPct || b.miniGames - a.miniGames)
}
