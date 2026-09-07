import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/localDb'
import { correctSessionDate, deleteSession } from '../data/repository'
import type { Session } from '../domain/types'
import { todayIso } from '../utils/id'
import { SeasonSettings } from './SeasonSettings'
import { displayDate } from './SeasonContext'
import { SessionRoleEditor } from './SessionRoleEditor'
import { SubmissionReview } from './SubmissionReview'

export function SeasonsScreen({ onOpen }: { onOpen: (session: Session) => void }) {
  const seasons = useLiveQuery(() => db.seasons.orderBy('startsOn').reverse().toArray(), []) ?? []
  const sessions = useLiveQuery(() => db.sessions.orderBy('playedOn').reverse().toArray(), []) ?? []
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<Session | null>(null)
  const [date, setDate] = useState('')
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [deleting, setDeleting] = useState<Session | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const season = seasons.find(s => s.id === selected)
  const nights = sessions.filter(s => selected === 'unassigned' ? !s.seasonId : s.seasonId === selected)
  return <section className="screen page-screen">
    <h1>Annir og kvöld</h1>
    <SubmissionReview/>
    <p>Opnaðu önn til að sjá kvöldin og breyta tímabilinu.</p>
    <div className="stack-list">{seasons.map(s => <button className="card season-context" key={s.id} onClick={() => { setSelected(s.id); setEditing(null); setMessage('') }} aria-pressed={selected === s.id}>
      <strong>{s.name}</strong><span>{displayDate(s.startsOn)} – {s.endsOn ? displayDate(s.endsOn) : 'engin lokadagsetning'}</span>
      <span>{sessions.filter(n => n.seasonId === s.id).length} kvöld {s.startsOn <= todayIso() && (!s.endsOn || s.endsOn >= todayIso()) && '· Í gangi'}</span>
    </button>)}</div>
    {sessions.some(s => !s.seasonId) && <button onClick={() => setSelected('unassigned')}>Kvöld án annar</button>}
    <SeasonSettings key={selected ?? 'new'} initialSeasonId={season?.id} />
    {selected && <section><h2>{season?.name ?? 'Kvöld án annar'}</h2>
      {!nights.length && <p>Engin kvöld skráð.</p>}
      {nights.map(n => <article className="card season-context" key={n.id}>
        <strong>{displayDate(n.playedOn)}</strong><span>{n.status === 'completed' ? 'Lokið' : n.status === 'live' ? 'Í gangi' : 'Í undirbúningi'}</span>
        {season && (n.playedOn < season.startsOn || (season.endsOn && n.playedOn > season.endsOn)) && <p role="alert">Kvöldið er utan tímabils annarinnar.</p>}
        <div className="night-actions"><button onClick={() => onOpen(n)}>Opna kvöld</button><button disabled={n.status === 'live'} onClick={() => { setEditing(n); setDate(n.playedOn); setTarget(n.seasonId ?? ''); setMessage('') }}>Breyta dagsetningu / önn</button></div>
        {n.status !== 'live' && <SessionRoleEditor sessionId={n.id} />}
        <button disabled={n.status === 'live' || busy} onClick={() => { setDeleting(n); setConfirmation(''); setMessage(''); setEditing(null) }}>Eyða kvöldi</button>
      </article>)}
    </section>}
    {editing && <form className="card season-context" onSubmit={async e => { e.preventDefault(); if (busy) return; setBusy(true); setMessage(''); try { await correctSessionDate(editing.id, date, target); setSelected(target); setEditing(null); setMessage('Dagsetning leiðrétt. Skráð gögn og hlutverk varðveitt.'); } catch (e) { setMessage(e instanceof Error ? e.message : 'Vistun mistókst.') } finally { setBusy(false) } }}>
      <h2>Leiðrétta kvöld frá {displayDate(editing.playedOn)}</h2>
      <label className="field">Rétt dagsetning<input required type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
      <label className="field">Önn<select required value={target} onChange={e => setTarget(e.target.value)}><option value="">Veldu önn</option>{seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <p>Lið, mörk og önnur skráð gögn haldast. Fastamanns-/varamannsstöður kvöldsins breytast ekki, jafnvel þótt önn eða dagsetning breytist.</p>
      {target !== editing.seasonId && <p role="alert">Kvöldið færist í aðra önn og telur þar í tölfræði.</p>}
      <button className="primary" disabled={busy}>Staðfesta leiðréttingu</button><button type="button" disabled={busy} onClick={() => setEditing(null)}>Hætta við</button>
    </form>}
    {deleting && <form className="card season-context" onSubmit={async e => { e.preventDefault(); if (busy || confirmation !== 'EYÐA') return; setBusy(true); setMessage(''); try { await deleteSession(deleting.id); setDeleting(null); setMessage('Kvöldinu eytt á tækinu. Eyðingin samstillist við Supabase þegar samband og aðgangur eru til staðar.'); } catch (e) { setMessage(e instanceof Error ? e.message : 'Eyðing mistókst.') } finally { setBusy(false) } }}>
      <h2>Eyða kvöldinu {displayDate(deleting.playedOn)}?</h2>
      <p>Önn: {seasons.find(s => s.id === deleting.seasonId)?.name ?? 'Engin önn'}. Mætingu, liðum, leikjum, mörkum og breytingasögu þessa kvölds verður eytt. Önnur kvöld, annir og leikmannalistinn haldast. Ekki er hægt að afturkalla eyðinguna í appinu.</p>
      <label className="field">Sláðu inn EYÐA<input value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off" /></label>
      <button className="primary" disabled={busy || confirmation !== 'EYÐA'}>Staðfesta eyðingu</button><button type="button" disabled={busy} onClick={() => setDeleting(null)}>Hætta við</button>
    </form>}
    {message && <p role="status">{message}</p>}
  </section>
}
