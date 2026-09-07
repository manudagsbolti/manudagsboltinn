import type { SummaryData } from '../services/sessionSummary'
import { buildSetTeamStats } from '../domain/rules'

export function NightSets({ data }: { data: SummaryData }) {
  const live = data.session.status !== 'completed'
  const latest = data.sets.at(-1)?.id
  const sets = data.sets.filter(s => s.status === 'completed' || data.games.some(g => g.setId === s.id && g.startedAt) || (live && s.id === latest))
  return <section className="night-sets"><h2>Sett kvöldsins</h2><div className="set-history">
    {[...sets].reverse().map(set => {
      const current = live && set.id === latest && set.status !== 'completed'
      const teams = data.teams.filter(t => t.setId === set.id).sort((a,b) => a.sortOrder - b.sortOrder)
      const games = data.games.filter(g => g.setId === set.id && g.status === 'completed')
      const ids = new Set(games.map(g => g.id))
      const stats = buildSetTeamStats(set, teams, games, data.session)
      const started = data.games.some(g => g.setId === set.id && g.startedAt)
      return <article className={`set-history-card card ${current ? 'current-set-card' : ''}`} key={set.id} aria-label={`Sett ${set.setNo}`}>
        <header><strong>Sett {set.setNo}</strong><span>{current ? started ? 'Í gangi' : 'Nýtt sett · tilbúið' : set.status === 'completed' ? 'Lokið' : 'Óunnið'}</span></header>
        <table className="set-detail-table"><thead><tr><th>Lið</th><th>Mörk</th><th>Sigrar</th></tr></thead><tbody>{stats.map(stat => {
          const team = teams.find(t => t.id === stat.teamId)!
          const goals = data.goals.filter(g => ids.has(g.gameId) && !g.deletedAt && g.teamId === team.id).length
          return <tr key={team.id}><th scope="row"><span className="team-dot" style={{ background: team.color }}/> {team.name}{stat.isWinner && ' 🏆'}</th><td>{goals}</td><td>{stat.smallWins} / {data.session.pointsToWinSet}</td></tr>
        })}</tbody></table>
        {current && <small>Fyrsta lið í {data.session.pointsToWinSet} sigra vinnur settið. Næsti leikur byrjar aðeins með Start.</small>}
      </article>
    })}
    {data.backfill?.rounds.map(round => <article className="set-history-card card" key={round.roundNo}><h3>Umferð {round.roundNo} · handskráð mörk</h3>{data.backfill!.teams.map(team => <p key={team.code}>{team.name}: {round.teamGoals[team.code] ?? 0} mörk</p>)}</article>)}
  </div></section>
}
