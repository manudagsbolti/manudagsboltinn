import type { buildSessionSummary } from '../services/sessionSummary'
import { CaptainBadge } from './CaptainBadge'

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
    {!!team.ownGoalsReceived && <p className="own-goal-note">Þar af {team.ownGoalsReceived} {team.ownGoalsReceived === 1 ? 'sjálfsmark andstæðinga' : 'sjálfsmörk andstæðinga'} í markatölu liðsins.</p>}
    <ul className="night-team-roster" aria-label="Leikmenn og mörk">{[...team.scorers].sort((a,b) => b.goals - a.goals || a.name.localeCompare(b.name, 'is')).map(player => <li key={player.playerId}><span>{player.captainSetNos.length>0 && <CaptainBadge/>}{player.name}{player.captainSetNos.length>0 && <small className="captain-sets">Fyrirliði · sett {player.captainSetNos.join(', ')}</small>}{!!player.ownGoals && <small className="own-goal-badge">{player.ownGoals} {player.ownGoals === 1 ? 'sjálfsmark' : 'sjálfsmörk'}</small>}</span><strong>{player.goals} <span className="roster-goal-label">mörk</span></strong></li>)}</ul>
  </article>)}</div>
}
