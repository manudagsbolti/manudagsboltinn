import { ClubCrest } from './ClubBrand'
import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/localDb'
import { syncCloud } from '../services/cloudSync'
import type { AppAccess } from '../services/access'
import { SubmitNight } from './SubmitNight'

export function RecorderHome({ access, go, signOut }: { access: AppAccess; go: (route: 'new' | 'setup' | 'live' | 'summary', id?: string) => void; signOut: () => void }) {
  const sessions = useLiveQuery(() => db.sessions.orderBy('playedOn').reverse().toArray(), []) ?? []
  const queued = useLiveQuery(() => db.submissions.where('state').equals('queued').count(), []) ?? 0
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const changed = () => setOnline(navigator.onLine)
    window.addEventListener('online', changed); window.addEventListener('offline', changed)
    return () => { window.removeEventListener('online', changed); window.removeEventListener('offline', changed) }
  }, [])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const sync = async () => {
    setBusy(true)
    try { const result = await syncCloud(); setMessage(result.deferredPull ? 'Nýjar breytingar varðveittar. Samstilltu aftur þegar hlé er á skráningu.' : 'Samstilling tókst.') }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Samstilling mistókst. Gögn eru á tækinu.') }
    finally { setBusy(false) }
  }
  return <section className="screen page-screen recorder-screen">
    <header className="recorder-brand"><ClubCrest/><div><span className="eyebrow">MÁNUDAGSBOLTINN</span><h1>Skráning kvöldsins</h1></div></header>
    <p className="recorder-intro">Veldu dag, skiptu í lið og skráðu leikina. Að kvöldi loknu sendirðu skráninguna til yfirferðar.</p>
    <button className="primary jumbo recorder-new" onClick={() => go('new')}><span aria-hidden="true">＋</span><span>Skrá nýtt kvöld<small>Velja dagsetningu og leikmenn</small></span><span aria-hidden="true">→</span></button>
    <section className="recorder-nights" aria-labelledby="my-nights"><div className="recorder-section-heading"><h2 id="my-nights">Kvöldin á þessu tæki</h2><span>{sessions.length}</span></div>
      {sessions.length === 0 && <div className="card recorder-empty"><h3>Tilbúinn fyrir næsta boltakvöld?</h3><p>Byrjaðu á „Skrá nýtt kvöld“. Þú getur haldið skráningu áfram án nets; innsending þarf nettengingu.</p></div>}
      {sessions.map(s => <article className={`card recorder-night ${s.status !== 'completed' ? 'recorder-night-active' : ''}`} key={s.id}>
        <header><span className="eyebrow">{s.status === 'live' ? 'Í GANGI' : s.status === 'draft' ? 'Í UNDIRBÚNINGI' : 'KVÖLDINU LOKIÐ'}</span><h3>{new Date(`${s.playedOn}T12:00:00`).toLocaleDateString('is-IS', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h3></header>
        <button className={s.status === 'completed' ? 'recorder-button' : 'primary jumbo'} onClick={() => go(s.status === 'completed' ? 'summary' : s.status === 'draft' ? 'setup' : 'live', s.id)}>{s.status === 'completed' ? 'Skoða skráningu' : s.status === 'draft' ? 'Klára uppstillingu →' : 'Halda áfram að skrá →'}</button>
        {s.status === 'completed' && <SubmitNight sessionId={s.id}/>}
      </article>)}
    </section>
    <aside className="card recorder-connection" aria-labelledby="connection-heading">
      <header><h2 id="connection-heading">Tenging og sendingar</h2><span className={`recorder-network ${online ? 'is-online' : ''}`}>{online ? 'Nettenging' : 'Án nets'}</span></header>
      <p role="status">{queued ? `${queued} kvöld bíða sendingar og sendast sjálfkrafa þegar samband næst.` : 'Engin kvöld bíða sendingar.'}</p>
      <p className="recorder-help">„Athuga tengingu“ sækir nýja leikmenn, athugar stöðu innsendinga og reynir að senda kvöld sem bíða. Til að senda lokið kvöld í fyrsta sinn velurðu „Senda til yfirferðar“ við kvöldið.</p>
      <button className="recorder-button" disabled={busy || !online} onClick={() => { void sync() }}>{busy ? 'Athuga samband…' : 'Athuga tengingu'}</button>
      {message && <p role="status">{message}</p>}
    </aside>
    <footer className="recorder-footer"><p>Eitt tæki skráir hvert kvöld.</p><button className="recorder-button recorder-signout" onClick={signOut}>Skrá út</button></footer>
  </section>
}
