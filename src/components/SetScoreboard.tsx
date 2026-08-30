import { buildSetTeamStats } from '../domain/rules'
import type { Game, SetRecord, SetTeam } from '../domain/types'

export function SetScoreboard({ set, teams, games, winsPerPoint, pointsToWinSet }: { set: SetRecord; teams: SetTeam[]; games: Game[]; winsPerPoint: number; pointsToWinSet: number }) {
  const stats = buildSetTeamStats(set, teams, games, { winsPerPoint, pointsToWinSet })
  return <div className="set-scoreboard" style={{ gridTemplateColumns: `repeat(${Math.max(teams.length, 1)}, 1fr)` }}>{stats.map(stat => {
    const team = teams.find(t => t.id === stat.teamId)!
    return <div className={`score-team ${stat.isWinner ? 'winner' : ''}`} key={team.id} style={{ '--team-color': team.color } as React.CSSProperties}>
      <div className="score-team-name"><span className="team-dot"/>{team.name}</div><strong>{stat.points}</strong>
      <div className="progress-dots">{Array.from({ length: winsPerPoint }, (_, i) => <i key={i} className={i < stat.progressWins ? 'filled' : ''}/>)}</div>
      <small>{stat.smallWins} litlir sigrar</small>
    </div>
  })}</div>
}
