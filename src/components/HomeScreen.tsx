import { ClubCrest } from './ClubBrand'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/localDb'
import { exportBackup } from '../services/backup'
import { SeasonContext } from './SeasonContext'
import { todayIso } from '../utils/id'

export function HomeScreen({ onNew, onManual, onContinue, onSetup, onSummary, signOut }: { onNew: () => void; onManual: () => void; onContinue: (id: string) => void; onSetup: (id: string) => void; onSummary: (id: string) => void; signOut: () => void }) {
  const data = useLiveQuery(async () => {
    const sessions = await db.sessions.orderBy('playedOn').reverse().toArray()
    const seasons = await db.seasons.toArray()
    const attendance = await db.sessionPlayers.toArray()
    const backfills = await db.sessionBackfills.toArray()
    return { sessions, seasons, attendance, backfills }
  }, [])

  if (!data) return <section className="screen loading-screen">Hleð…</section>
  const active = data.sessions.find(s => s.status !== 'completed')
  const today = todayIso()
  const season = data.seasons.filter(s => s.startsOn <= today && (!s.endsOn || s.endsOn >= today)).sort((a,b) => Number(b.isActive) - Number(a.isActive))[0]
  const completed = season ? data.sessions.filter(s => s.status === 'completed' && s.seasonId === season.id) : []

  return <section className="screen home-screen">
    <header className="hero-header"><div><ClubCrest/><div><span className="eyebrow">MÁNUDAGSBOLTINN</span><h1 className="club-motto">Þar sem kappið ber<br/><em>fegurðina ofurliði.</em></h1></div></div><div className="hero-actions"><button className="backup-quick" onClick={signOut}>Skrá út</button><button className="backup-quick" onClick={()=>void exportBackup()} title="Sækja öryggisafrit">↓ Backup</button><div className="online-dot" title="Offline-first">●</div></div></header>

    {active ? <article className="continue-card" onClick={() => active.status === 'draft' ? onSetup(active.id) : onContinue(active.id)}><div><span className="live-badge">● Í GANGI</span><h2>{active.status === 'draft' ? 'Leikdagur tilbúinn' : 'Kvöldið er í gangi'}</h2><p>{formatDate(active.playedOn)}</p></div><button>Halda áfram →</button></article>
    : <button className="new-session-hero" onClick={onNew}><span className="plus-orb">+</span><div><strong>Byrja nýjan leikdag</strong><small>Mæting · lið · sett · tölfræði</small></div><b>→</b></button>}
    <button className="historical-entry-link" onClick={onManual}><span>✎</span><div><strong>Handskrá kvöld</strong><small>Þegar live-skráning var ekki notuð eða gögn vantar</small></div><b>→</b></button>

    <SeasonContext date={todayIso()} current />
    <section className="recent-section"><div className="subheading"><span>KVÖLD ANNARINNAR</span><strong>{completed.length} skráð kvöld</strong></div>
      {completed.length ? <div className="history-list">{completed.map(session => {
        const ids = data.attendance.filter(a => a.sessionId === session.id).map(a => a.playerId)
        const backfill = data.backfills.find(item => item.sessionId === session.id)
        return <button className="history-row card" key={session.id} onClick={() => onSummary(session.id)}><div className="date-tile"><strong>{new Date(`${session.playedOn}T12:00:00`).getDate()}</strong><span>{new Date(`${session.playedOn}T12:00:00`).toLocaleDateString('is-IS',{month:'short'}).replace('.','')}</span></div><div className="grow"><strong>{formatDate(session.playedOn)}</strong><small>{ids.length} leikmenn · Skoða kvöldið</small></div>{backfill && <em className="imported-badge">Handskráð</em>}<span>›</span></button>
      })}</div> : <div className="empty-state compact"><div>🏟️</div><h3>Engin skráð kvöld</h3><p>Hér birtast skráð kvöld þeirrar annar sem er í gangi.</p></div>}
    </section>
  </section>
}

function formatDate(date: string) { return new Date(`${date}T12:00:00`).toLocaleDateString('is-IS', { weekday:'long', day:'numeric', month:'long' }) }
