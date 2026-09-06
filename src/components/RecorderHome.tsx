import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/localDb'
import { syncCloud } from '../services/cloudSync'
import type { AppAccess } from '../services/access'

export function RecorderHome({ access, go, signOut }: { access: AppAccess; go: (route: 'new' | 'setup' | 'live' | 'summary', id?: string) => void; signOut: () => void }) {
  const sessions = useLiveQuery(() => db.sessions.filter(s => s.playedOn === access.playedOn && s.seasonId === access.seasonId).toArray(), [access.playedOn, access.seasonId]) ?? []
  const queued = useLiveQuery(() => db.syncQueue.count(), []) ?? 0
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
    {access.playedOn ? <>
      <p>{access.playedOn} · Eitt skráningartæki í einu.</p>
      {!sessions.length && <button className="primary jumbo" onClick={() => go('new')}>Velja mætingu og lið</button>}
      {sessions.map(s => <article className="card" key={s.id}><h2>{s.status === 'completed' ? 'Kvöldinu lokið' : 'Kvöldið er tilbúið'}</h2><button className="primary jumbo" onClick={() => go(s.status === 'completed' ? 'summary' : s.status === 'draft' ? 'setup' : 'live', s.id)}>{s.status === 'completed' ? 'Samantekt kvöldsins' : 'Halda áfram'}</button></article>)}
    </> : <p>Stjórnandi hefur ekki opnað kvöld fyrir skráningu. Opnaðu appið aftur þegar það er tilbúið.</p>}
    <p role="status">{queued ? `${queued} breytingar bíða sendingar.` : 'Engar breytingar bíða sendingar.'}</p>
    <button disabled={busy} onClick={() => { void sync() }}>{busy ? 'Samstilli…' : 'Samstilla / sækja kvöldið'}</button>
    {message && <p role="status">{message}</p>}
    <button className="text-button" onClick={signOut}>Skrá út</button>
  </section>
}
