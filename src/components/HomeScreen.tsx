import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/localDb'
import { calculateBackfillPlayerStats, calculateSessionPlayerStats } from '../services/stats'
import { exportBackup } from '../services/backup'
import { SeasonContext } from './SeasonContext'
import { todayIso } from '../utils/id'

export function HomeScreen({ onNew, onManual, onContinue, onSetup, onSummary }: { onNew: () => void; onManual: () => void; onContinue: (id: string) => void; onSetup: (id: string) => void; onSummary: (id: string) => void }) {
  const data = useLiveQuery(async () => {
    const sessions = await db.sessions.orderBy('playedOn').reverse().toArray()
    const players = await db.players.toArray()
    const sets = await db.sets.toArray()
    const teams = await db.setTeams.toArray()
    const memberships = await db.setTeamMembers.toArray()
    const games = await db.games.toArray()
    const goals = await db.goals.toArray()
    const attendance = await db.sessionPlayers.toArray()
    const backfills = await db.sessionBackfills.toArray()
    return { sessions, players, sets, teams, memberships, games, goals, attendance, backfills }
  }, [])

  if (!data) return <section className="screen loading-screen">Hleð…</section>
  const active = data.sessions.find(s => s.status !== 'completed')
  const completed = data.sessions.filter(s => s.status === 'completed').slice(0, 5)
  const totalGoals = data.goals.filter(g => !g.deletedAt).length + data.backfills.reduce((sum, item) => sum + item.playerGoals.reduce((goalSum, row) => goalSum + row.goals, 0), 0)
  const completedSets = data.sets.filter(s => s.status === 'completed').length + data.backfills.reduce((sum, item) => sum + item.rounds.length, 0)

  const heroStats = data.sessions.filter(s => s.status === 'completed').flatMap(session => {
    const ids = data.attendance.filter(a => a.sessionId === session.id).map(a => a.playerId)
    const backfill = data.backfills.find(item => item.sessionId === session.id)
    return backfill ? calculateBackfillPlayerStats(backfill) : calculateSessionPlayerStats({
      playerIds: ids,
      sets: data.sets.filter(s => s.sessionId === session.id),
      teams: data.teams.filter(t => data.sets.some(s => s.sessionId === session.id && s.id === t.setId)),
      memberships: data.memberships.filter(m => data.sets.some(s => s.sessionId === session.id && s.id === m.setId)),
      games: data.games.filter(g => data.sets.some(s => s.sessionId === session.id && s.id === g.setId)),
      goals: data.goals.filter(goal => data.games.some(g => g.id === goal.gameId && data.sets.some(s => s.sessionId === session.id && s.id === g.setId))),
      winsPerPoint: session.winsPerPoint, pointsToWinSet: session.pointsToWinSet,
    })
  })
  const topScorer = [...heroStats].sort((a,b) => b.goals - a.goals)[0]

  return <section className="screen home-screen">
    <header className="hero-header"><div><span className="brand-ball">⚽</span><div><span className="eyebrow">MÁNUDAGSBOLTINN</span><h1>Bolti. Stig.<br/><em>Mont.</em></h1></div></div><div className="hero-actions"><button className="backup-quick" onClick={()=>void exportBackup()} title="Sækja öryggisafrit">↓ Backup</button><div className="online-dot" title="Offline-first">●</div></div></header>

    {active ? <article className="continue-card" onClick={() => active.status === 'draft' ? onSetup(active.id) : onContinue(active.id)}><div><span className="live-badge">● Í GANGI</span><h2>{active.status === 'draft' ? 'Leikdagur tilbúinn' : 'Kvöldið er í gangi'}</h2><p>{formatDate(active.playedOn)}</p></div><button>Halda áfram →</button></article>
    : <button className="new-session-hero" onClick={onNew}><span className="plus-orb">+</span><div><strong>Byrja nýjan leikdag</strong><small>Mæting · lið · sett · tölfræði</small></div><b>→</b></button>}
    <button className="historical-entry-link" onClick={onManual}><span>✎</span><div><strong>Handskrá kvöld</strong><small>Þegar live-skráning var ekki notuð eða gögn vantar</small></div><b>→</b></button>

    <SeasonContext date={todayIso()} current />
    <div className="home-metrics">
      <div><strong>{completedSets}</strong><span>sett skráð</span></div><div><strong>{totalGoals}</strong><span>mörk</span></div><div><strong>{topScorer?.goals ?? 0}</strong><span>{topScorer ? `${data.players.find(p => p.id === topScorer.playerId)?.name} · mörk` : 'toppskor'}</span></div>
    </div>

    <section className="recent-section"><div className="subheading"><span>SAGA</span><strong>Síðustu kvöld</strong></div>
      {completed.length ? <div className="history-list">{completed.map(session => {
        const sessionSets = data.sets.filter(s => s.sessionId === session.id)
        const ids = data.attendance.filter(a => a.sessionId === session.id).map(a => a.playerId)
        const backfill = data.backfills.find(item => item.sessionId === session.id)
        const stats = (backfill ? calculateBackfillPlayerStats(backfill) : calculateSessionPlayerStats({
          playerIds: ids, sets: sessionSets,
          teams: data.teams.filter(t => sessionSets.some(s => s.id === t.setId)),
          memberships: data.memberships.filter(m => sessionSets.some(s => s.id === m.setId)),
          games: data.games.filter(g => sessionSets.some(s => s.id === g.setId)),
          goals: data.goals.filter(goal => data.games.some(g => g.id === goal.gameId && sessionSets.some(s => s.id === g.setId))),
          winsPerPoint: session.winsPerPoint, pointsToWinSet: session.pointsToWinSet,
        })).sort((a,b)=>b.points-a.points || b.goals-a.goals)
        const leader = stats[0]
        return <button className="history-row card" key={session.id} onClick={() => onSummary(session.id)}><div className="date-tile"><strong>{new Date(`${session.playedOn}T12:00:00`).getDate()}</strong><span>{new Date(`${session.playedOn}T12:00:00`).toLocaleDateString('is-IS',{month:'short'}).replace('.','')}</span></div><div className="grow"><strong>{backfill?.rounds.length ?? sessionSets.length} sett · {ids.length} leikmenn</strong><small>{leader ? `${data.players.find(p => p.id === leader.playerId)?.name} efstur með ${leader.points} sigra` : 'Engin tölfræði'}</small></div>{backfill && <em className="imported-badge">Handskráð</em>}<span>›</span></button>
      })}</div> : <div className="empty-state compact"><div>🏟️</div><h3>Fyrsta kvöldið bíður</h3><p>Þegar þú klárar leikdag birtist sagan hér.</p></div>}
    </section>
  </section>
}

function formatDate(date: string) { return new Date(`${date}T12:00:00`).toLocaleDateString('is-IS', { weekday:'long', day:'numeric', month:'long' }) }
