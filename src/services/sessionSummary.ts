import type { Game, Goal, Player, Session, SessionBackfill, SessionPlayer, SetRecord, SetTeam, SetTeamMember } from '../domain/types'
import { calculateBackfillPlayerStats, calculateSessionPlayerStats } from './stats'

export interface SummaryData {
  session: Session
  attendance: SessionPlayer[]
  players: Player[]
  sets: SetRecord[]
  teams: SetTeam[]
  memberships: SetTeamMember[]
  games: Game[]
  goals: Goal[]
  backfill?: SessionBackfill
}

export function buildSessionSummary(data: SummaryData) {
  const sets = data.sets.filter(s => s.sessionId === data.session.id)
  const setIds = new Set(sets.map(s => s.id))
  const games = data.games.filter(g => setIds.has(g.setId) && g.status === 'completed' && (g.endReason === 'goal' || g.endReason === 'timeout'))
  const gameIds = new Set(games.map(g => g.id))
  const draws = games.filter(g => g.endReason === 'timeout' && !g.winningTeamId)
  const goals = data.goals.filter(g => gameIds.has(g.gameId) && !g.deletedAt)
  const playedSets = sets.filter(s => s.status === 'completed' || data.games.some(g => g.setId === s.id && g.startedAt))
  const name = (id: string) => data.players.find(p => p.id === id)?.name ?? 'Óþekktur leikmaður'
  const attendance = data.attendance.filter(a => a.sessionId === data.session.id)
  const rawStats = data.backfill ? calculateBackfillPlayerStats(data.backfill) : calculateSessionPlayerStats({
    ...data.session, playerIds: attendance.map(p => p.playerId), sets: playedSets,
    teams: data.teams, memberships: data.memberships, games, goals,
  })
  const players = rawStats.map(row => {
    const teamNames = data.backfill
      ? data.backfill.teams.filter(t => t.playerIds.includes(row.playerId)).map(t => t.name)
      : data.teams.filter(t => setIds.has(t.setId) && data.memberships.some(m => m.teamId === t.id && m.playerId === row.playerId)).map(t => t.name)
    return { ...row, name: name(row.playerId), teams: [...new Set(teamNames)].join(' / ') || '—',
      role: attendance.find(p => p.playerId === row.playerId)?.roleAtSession ?? 'SUBSTITUTE',
      contributions: data.backfill ? null : row.goals + row.assists,
      assists: data.backfill ? null : row.assists, ownGoals: data.backfill ? null : row.ownGoals,
      miniGames: data.backfill ? null : row.miniGames,
      draws: data.backfill ? null : draws.filter(g => data.memberships.some(m => m.playerId === row.playerId && m.setId === g.setId && (m.teamId === g.holderTeamId || m.teamId === g.challengerTeamId))).length,
    }
  }).sort((a,b) => b.setWins-a.setWins || b.smallWins-a.smallWins || b.goals-a.goals || a.name.localeCompare(b.name, 'is'))

  // Reusing a color with different players does not merge distinct rosters.
  const teams = new Map<string, { key: string; name: string; color: string; members: string[]; scorers: { playerId: string; name: string; goals: number }[]; setNos: number[]; wins: number; sets: number; goals: number; games: number | null; draws: number | null }>()
  for (const team of data.teams.filter(t => setIds.has(t.setId)).sort((a,b) => a.sortOrder-b.sortOrder)) {
    const ids = data.memberships.filter(m => m.teamId === team.id).map(m => m.playerId).sort()
    const key = JSON.stringify([team.sortOrder, ids])
    const row = teams.get(key) ?? { key, name: team.name, color: team.color, members: ids.map(name), scorers: ids.map(playerId => ({ playerId, name: name(playerId), goals: 0 })), setNos: [], wins: 0, sets: 0, goals: 0, games: 0, draws: 0 }
    row.draws! += draws.filter(g => g.holderTeamId === team.id || g.challengerTeamId === team.id).length
    for (const scorer of row.scorers) scorer.goals += goals.filter(g => g.teamId === team.id && g.scorerPlayerId === scorer.playerId && g.eventType !== 'OWN_GOAL').length
    const set = sets.find(s => s.id === team.setId)!
    if (playedSets.includes(set)) row.setNos.push(set.setNo)
    row.wins += games.filter(g => g.winningTeamId === team.id).length
    row.sets += Number(set.status === 'completed' && set.winningTeamId === team.id)
    row.goals += goals.filter(g => g.teamId === team.id).length
    row.games! += games.filter(g => g.holderTeamId === team.id || g.challengerTeamId === team.id).length
    teams.set(key, row)
  }
  if (data.backfill) for (const team of data.backfill.teams) {
    teams.set(team.code, { key: team.code, name: team.name, color: team.color, members: team.playerIds.map(name), scorers: team.playerIds.map(playerId => ({ playerId, name: name(playerId), goals: data.backfill!.playerGoals.filter(p => p.playerId === playerId).reduce((sum,p) => sum + p.goals, 0) })), draws: null, setNos: data.backfill.rounds.map(r => r.roundNo),
      wins: data.backfill.rounds.reduce((sum,r) => sum + (r.teamGoals[team.code] ?? 0),0),
      sets: rawStats.find(p => team.playerIds.includes(p.playerId))?.setWins ?? 0,
      goals: data.backfill.rounds.reduce((sum,r) => sum + (r.teamGoals[team.code] ?? 0),0), games: null })
  }
  return { players, teams: [...teams.values()], playedSets,
    draws: data.backfill ? null : draws.length,
    completedSets: data.backfill ? data.backfill.rounds.length : sets.filter(s => s.status === 'completed').length,
    miniGames: data.backfill ? null : games.length,
    goals: data.backfill ? data.backfill.playerGoals.reduce((sum,p) => sum+p.goals,0) : goals.length,
    unfinishedGame: data.games.some(g => setIds.has(g.setId) && !!g.startedAt && g.status !== 'completed'),
  }
}
