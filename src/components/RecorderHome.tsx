import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/localDb'
import { syncCloud } from '../services/cloudSync'
import type { AppAccess } from '../services/access'
import { SubmitNight } from './SubmitNight'

export function RecorderHome({ access, go, signOut }: { access: AppAccess; go: (route: 'new' | 'setup' | 'live' | 'summary', id?: string) => void; signOut: () => void }) {
  const sessions = useLiveQuery(() => db.sessions.orderBy('playedOn').reverse().toArray(), []) ?? []
  const queued = useLiveQuery(() => db.submissions.where('state').equals('queued').count(), []) ?? 0
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const sync = async () => {
    setBusy(true)
    try { const result = await syncCloud(); setMessage(result.deferredPull ? 'Nýjar breytingar varðveittar. Samstilltu aftur þegar hlé er á skráningu.' : 'Samstilling tókst.') }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Samstilling mistókst. Gögn eru á tækinu.') }
    finally { setBusy(false) }
  }
  return <section className="screen page-screen">
    <span className="eyebrow">MÁNUDAGSBOLTINN</span><h1>Skráning kvöldsins</h1>
      <p>Skráningar á þessu tæki · Eitt tæki skráir hvert kvöld.</p>
      <button className="primary jumbo" onClick={() => go('new')}>Skrá nýtt kvöld · velja dagsetningu</button>
      {sessions.map(s => <article className="card" key={s.id}><h2>{s.playedOn} · {s.status === 'completed' ? 'Kvöldinu lokið' : 'Kvöldið er tilbúið'}</h2><button className="primary jumbo" onClick={() => go(s.status === 'completed' ? 'summary' : s.status === 'draft' ? 'setup' : 'live', s.id)}>{s.status === 'completed' ? 'Samantekt kvöldsins' : 'Halda áfram'}</button>{s.status === 'completed' && <SubmitNight sessionId={s.id}/>}</article>)}
    <p role="status">{queued ? `${queued} kvöld bíða sendingar.` : 'Engar innsendingar í bið. Ósend kvöld þarf að senda sérstaklega til yfirferðar.'}</p>
    <button disabled={busy} onClick={() => { void sync() }}>{busy ? 'Samstilli…' : 'Samstilla / sækja leikmenn'}</button>
    {message && <p role="status">{message}</p>}
    <button className="text-button" onClick={signOut}>Skrá út</button>
  </section>
}
