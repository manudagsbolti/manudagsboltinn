import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/localDb'
import { buildSetTeamStats } from '../domain/rules'
import { buildSessionSummary } from '../services/sessionSummary'
import { RoleBadge } from './RoleBadge'
import type { Player } from '../domain/types'

export function SessionSummaryScreen({ sessionId, onBack }: { sessionId: string; onBack: () => void }) {
  const data = useLiveQuery(async () => {
    const session = await db.sessions.get(sessionId); if (!session) return null
    const attendance = await db.sessionPlayers.where('sessionId').equals(sessionId).toArray()
    const players = (await db.players.bulkGet(attendance.map(a=>a.playerId))).filter((p): p is Player => !!p)
    const sets = await db.sets.where('sessionId').equals(sessionId).sortBy('setNo')
    const ids = sets.map(s=>s.id)
    const teams = ids.length ? await db.setTeams.where('setId').anyOf(ids).toArray() : []
    const memberships = ids.length ? await db.setTeamMembers.where('setId').anyOf(ids).toArray() : []
    const games = ids.length ? await db.games.where('setId').anyOf(ids).toArray() : []
    const goals = games.length ? await db.goals.where('gameId').anyOf(games.map(g=>g.id)).toArray() : []
    const backfill = await db.sessionBackfills.get(sessionId)
    return { session, attendance, players, sets, teams, memberships, games, goals, backfill }
  }, [sessionId])
  if (data === null) return <section className="screen page-screen"><h1>Kv?ld fannst ekki</h1><button onClick={onBack}>Til baka</button></section>
  if (!data) return <section className="screen loading-screen">Hleð samantekt…</section>
  const summary = buildSessionSummary(data)
  return <section className="screen page-screen summary-screen">
    <button className="back-button" onClick={onBack}>← Heim</button>
    <header className="summary-hero">
      <span className="eyebrow">{data.session.status === 'completed' ? 'KVÖLDINU LOKIÐ' : 'STAÐA KVÖLDSINS'}{data.backfill && ' · HANDSKRÁÐ'}</span>
      <h1>{new Date(`${data.session.playedOn}T12:00:00`).toLocaleDateString('is-IS', { weekday:'long', day:'numeric', month:'long' })}</h1>
      <p>{summary.players.length} leikmenn · {summary.miniGames ?? '—'} leikir · {summary.completedSets} unnin sett · {summary.goals} mörk</p>
      <p>Gögn vistuð á þessu tæki.</p>
      {summary.unfinishedGame && <p className="data-quality-note">Ólokinn leikur er varðveittur en telst ekki með. Óunnið sett fær engan settsigur.</p>}
      {data.backfill && <p className="data-quality-note">Stoðsendingar, sjálfsmörk og nákvæm leikjaröð voru ekki skráð. — merkir óskráð, ekki núll.</p>}
    </header>
    <section aria-labelledby="summary-teams"><h2 id="summary-teams">Lið kvöldsins</h2>
      <div className="summary-team-cards">{summary.teams.map(team => <article className="card summary-team" key={team.key}>
        <h3><span className="team-dot" style={{ background: team.color }}/> {team.name}</h3>
        <p>{team.members.length} leikmenn{team.setNos.length > 0 && ` · Sett ${team.setNos.join(', ')}`}</p>
        <dl className="summary-numbers"><div><dt>Sigrar</dt><dd>{team.wins}</dd></div><div><dt>Sett</dt><dd>{team.sets}</dd></div><div><dt>Mörk</dt><dd>{team.goals}</dd></div><div><dt>Leikir</dt><dd>{team.games ?? '—'}</dd></div></dl>
        <p>{team.members.join(' · ')}</p>
      </article>)}</div>
    </section>
    <section aria-labelledby="summary-players"><h2 id="summary-players">Allir leikmenn</h2>
      <p className="setup-hint">F = fastamaður · V = varamaður á þessu kvöldi. G+A = mörk + stoðsendingar. Liðsaðild í hverju setti ræður sigrum leikmannsins.</p>
      <div className="summary-table-wrap" tabIndex={0} role="region" aria-label="Tölfræði allra leikmanna, flettu til hliðar">
        <table className="summary-table"><caption>Kvöldið í tölum</caption><thead><tr><th scope="col">Leikmaður</th><th scope="col">Lið</th><th scope="col">Staða</th><th scope="col">Leikir</th><th scope="col">Sigrar</th><th scope="col">Sett</th><th scope="col">Mörk</th><th scope="col">Stoðs.</th><th scope="col">G+A</th><th scope="col">Sjálfsm.</th></tr></thead>
          <tbody>{summary.players.map(p => <tr key={p.playerId}><th scope="row">{p.name}</th><td>{p.teams}</td><td><RoleBadge role={p.role}/><span className="sr-only">{p.role === 'REGULAR' ? 'Fastamaður' : 'Varamaður'}</span></td><td>{p.miniGames ?? '—'}</td><td>{p.smallWins}</td><td>{p.setWins}</td><td>{p.goals}</td><td>{p.assists ?? '—'}</td><td>{p.contributions ?? '—'}</td><td>{p.ownGoals ?? '—'}</td></tr>)}</tbody>
        </table>
      </div>
      {!summary.miniGames && !data.backfill && <p>Engir leikir kláruðust. Allir valdir leikmenn eru sýndir.</p>}
    </section>
    <section><h2>Sett kvöldsins</h2><div className="set-history">
      {summary.playedSets.map(set => {
        const teams = data.teams.filter(t => t.setId === set.id)
        const stats = buildSetTeamStats(set, teams, data.games.filter(g => g.setId === set.id), data.session)
        return <article className="set-history-card card" key={set.id}><header><strong>Sett {set.setNo}</strong><span>{set.status === 'completed' ? 'Lokið' : 'Óunnið · enginn settsigur'}</span></header>{stats.map(row => {
          const team = teams.find(t => t.id === row.teamId)!
          return <div className="set-history-team" key={team.id}><span className="team-dot" style={{ background:team.color }}/><strong>{team.name}{row.isWinner ? ' · sigurvegari' : ''}</strong><b>{row.smallWins}</b></div>
        })}</article>
      })}
      {data.backfill?.rounds.map(round => <article className="set-history-card card" key={round.roundNo}><h3>Umferð {round.roundNo}</h3>{data.backfill!.teams.map(team => <p key={team.code}>{team.name}: {round.teamGoals[team.code] ?? 0}</p>)}</article>)}
    </div></section>
    <button className="primary jumbo summary-home" onClick={onBack}>Til baka á heim</button>
  </section>
}
