import { useApp } from '../context/AppContext'
import type { Session } from '../domain/types'
import { SyncIndicator } from '../components/SyncIndicator'

function formatDate(date: string) {
  return new Intl.DateTimeFormat('is-IS', { day: 'numeric', month: 'long' }).format(new Date(`${date}T12:00:00`))
}

export function HomeScreen({ onNewSession, onOpenSession, onOpenSummary }: {
  onNewSession: () => void
  onOpenSession: (session: Session) => void
  onOpenSummary: (session: Session) => void
}) {
  const { state, selectedSeason, setSelectedSeason, activeSession } = useApp()
  const sessions = state.sessions.filter((s) => !selectedSeason || s.seasonId === selectedSeason.id).sort((a, b) => b.sessionDate.localeCompare(a.sessionDate))

  return <main className="page page-with-nav">
    <header className="page-header">
      <div>
        <p className="eyebrow">MÁNUDAGSBOLTINN</p>
        <h1>Heim</h1>
      </div>
      <SyncIndicator />
    </header>

    {state.seasons.length > 0 && <label className="field compact">
      <span>Önn</span>
      <select value={selectedSeason?.id ?? ''} onChange={(e) => setSelectedSeason(e.target.value)}>
        {state.seasons.slice().sort((a,b) => b.startDate.localeCompare(a.startDate)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </label>}

    {!selectedSeason ? <section className="empty-card">
      <h2>Byrjum á önninni</h2>
      <p>Stofnaðu önn og leikmenn undir Stjórnun. Þá verður hægt að stofna fyrsta boltakvöldið.</p>
    </section> : <>
      {activeSession ? <section className="hero-card active-session-card">
        <p className="eyebrow">VIRKT KVÖLD</p>
        <h2>{formatDate(activeSession.sessionDate)}</h2>
        <p>Sett #{activeSession.setNumber} · {activeSession.teamCount} lið</p>
        <button className="primary huge" onClick={() => onOpenSession(activeSession)}>▶ Halda áfram</button>
      </section> : <button className="primary huge new-session-button" onClick={onNewSession}>＋ Nýtt boltakvöld</button>}

      <section className="section-block">
        <div className="section-heading"><h2>Síðustu kvöld</h2><span>{sessions.length}</span></div>
        {sessions.length === 0 ? <p className="muted">Engin kvöld skráð á þessari önn.</p> : <div className="session-list">
          {sessions.slice(0, 10).map((session) => <button key={session.id} className="session-row" onClick={() => session.status === 'ACTIVE' ? onOpenSession(session) : onOpenSummary(session)}>
            <div><strong>{formatDate(session.sessionDate)}</strong><span>{session.teamCount} lið · {session.players.length} leikmenn</span></div>
            <div className="session-row-score">{session.teams.map((t) => <span key={t.code}>{t.code} {session.sessionSets[t.code]}</span>)}</div>
          </button>)}
        </div>}
      </section>
    </>}
  </main>
}
