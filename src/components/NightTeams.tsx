import type { buildSessionSummary } from '../services/sessionSummary'

export function NightTeams({ teams }: { teams: ReturnType<typeof buildSessionSummary>['teams'] }) {
  return <div className="summary-team-cards">{teams.map(team => <article className="card summary-team" key={team.key}>
    <h3><span className="team-dot" style={{ background: team.color }}/> {team.name}</h3>
    <p>{team.members.length} leikmenn{team.setNos.length > 0 && ` · Sett ${team.setNos.join(', ')}`}</p>
    <dl className="summary-numbers">
      <div><dt>Sett</dt><dd>{team.sets}</dd></div>
      <div><dt>Sigrar</dt><dd>{team.wins}</dd></div>
      <div><dt>Jafntefli</dt><dd>{team.draws ?? '—'}</dd></div>
      <div><dt>Mörk</dt><dd>{team.goals}</dd></div>
    </dl>
    <p>{team.games ?? 'Óskráður fjöldi'} leikir</p>
    <ul className="night-team-roster" aria-label="Leikmenn og mörk">{[...team.scorers].sort((a,b) => b.goals - a.goals || a.name.localeCompare(b.name, 'is')).map(player => <li key={player.playerId}><span>{player.name}</span><strong>{player.goals} <span className="roster-goal-label">mörk</span></strong></li>)}</ul>
  </article>)}</div>
}
