import { buildSetTeamStats } from '../domain/rules'
import type { Game, SetRecord, SetTeam } from '../domain/types'

export function SetScoreboard({ set, teams, games, winsPerPoint, pointsToWinSet, setWins = {} }: { set: SetRecord; teams: SetTeam[]; games: Game[]; winsPerPoint: number; pointsToWinSet: number; setWins?: Record<string, number> }) {
  const stats = buildSetTeamStats(set, teams, games, { winsPerPoint, pointsToWinSet })
  return <div className="set-scoreboard" style={{ gridTemplateColumns: `repeat(${Math.max(teams.length, 1)}, 1fr)` }}>{stats.map(stat => {
    const team = teams.find(t => t.id === stat.teamId)!
    return <div className={`score-team ${stat.isWinner ? 'winner' : ''}`} key={team.id} style={{ '--team-color': team.color } as React.CSSProperties}>
      <div className="score-team-name"><span className="team-dot"/>{team.name}</div><strong>{stat.points}</strong>
      <div className="progress-dots">{Array.from({ length: pointsToWinSet }, (_, i) => <i key={i} className={i < stat.smallWins ? 'filled' : ''}/>)}</div>
      <small>{stat.smallWins} sigrar</small>
      <div className="set-win-stars" role="img" aria-label={`${team.name}: ${setWins[team.id] ?? 0} unnin sett í kvöld`} title={`${setWins[team.id] ?? 0} unnin sett í kvöld`}>
        {Array.from({ length: setWins[team.id] ?? 0 }, (_, i) => <span key={i} aria-hidden="true">★</span>)}
      </div>
    </div>
  })}</div>
}
