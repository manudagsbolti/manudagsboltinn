import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/localDb'
import { supabase } from '../lib/supabase'
import { syncCloud } from '../services/cloudSync'
import { fromSnakeCase } from '../services/syncData'
import { buildSessionSummary } from '../services/sessionSummary'
import type { ReviewSubmission } from '../services/submissions'
import type { PlayerRole } from '../domain/types'
import { roleOnDate } from '../data/repository'
import { uniqueSeasonForDate } from '../domain/seasons'
import { NightSets } from './NightSets'

export function SubmissionReview() {
  const seasons = useLiveQuery(() => db.seasons.toArray(), []) ?? []
  const periods = useLiveQuery(() => db.rolePeriods.toArray(), []) ?? []
  const [items, setItems] = useState<ReviewSubmission[]>([])
  const [selected, setSelected] = useState<ReviewSubmission | null>(null)
  const [date, setDate] = useState('')
  const [chosenSeasonId, setSeasonId] = useState<string | null>(null)
  const seasonId = chosenSeasonId ?? uniqueSeasonForDate(seasons, date)?.id ?? ''
  const roleSeason = seasons.find(s => s.id === seasonId && date && s.startsOn <= date && (!s.endsOn || s.endsOn >= date))
  const [roles, setRoles] = useState<Record<string, PlayerRole>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const load = async () => {
    if (!supabase) throw new Error('Tengdu Supabase til að sækja innsendingar.')
    const { data, error } = await supabase.from('night_submissions').select('id,payload,state,created_at').eq('state','pending').order('created_at')
    if (error) throw new Error('Ekki tókst að sækja innsendingar. Athugaðu tengingu og migration 011.')
    setItems((data ?? []).map(i => ({ ...i, payload: fromSnakeCase(i.payload) })) as ReviewSubmission[])
  }
  const run = async (action: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setMessage('')
    try { await action() } catch (e) { setMessage(e instanceof Error ? e.message : 'Aðgerð mistókst.') }
    finally { setBusy(false) }
  }
  const decide = async (accept: boolean) => {
    if (!selected || !supabase) return
    // Flush admin edits first. Approval creates facts atomically on the server;
    // a later failed download does not turn an accepted night into a duplicate.
    await syncCloud()
    const { data, error } = await supabase.rpc('review_night', { submission_id: selected.id, accept, played_on: accept ? date : null, season_id: accept ? seasonId : null, roles })
    if (error) throw new Error('Ekki tókst að afgreiða kvöldið. Athugaðu dagsetningu, önn og hvort kvöldið sé þegar skráð. Gögn eru áfram í yfirferð.')
    setSelected(null); await load()
    setMessage(data === 'approved' ? 'Kvöld samþykkt. Sæki uppfærð gögn…' : 'Skráningu hafnað. Hún telur ekki í tölfræði.')
    if (data === 'approved') {
      try { await syncCloud(); setMessage('Kvöld samþykkt og komið í annartölfræði.') }
      catch { setMessage('Kvöld samþykkt í Supabase. Veldu Sync núna til að sækja það á þetta tæki.') }
    }
  }
  let summary: ReturnType<typeof buildSessionSummary> | null = null
  try { if (selected) summary = buildSessionSummary(selected.payload) } catch { /* malformed submissions can still be rejected */ }
  return <section className="card season-context"><h2>Bíður samþykktar</h2>
    <p>Innsend kvöld telja ekki í annartölfræði fyrr en þú samþykkir þau.</p>
    <button disabled={busy} onClick={() => void run(load)}>Sækja innsendingar</button>
    {items.map(i => <button disabled={busy} key={i.id} onClick={() => { setSelected(i); setDate(i.payload.session?.playedOn ?? ''); setSeasonId(null); setRoles({}); setMessage('') }}>{i.payload.session?.playedOn ?? 'Ógild dagsetning'} · Yfirfara kvöld</button>)}
    {selected && <article><h3>Yfirferð kvölds</h3>
      {summary ? <><p>{summary.players.length} leikmenn · {summary.goals} mörk · {summary.completedSets} unnin sett</p><NightSets data={selected.payload}/>
        <label className="field">Leikdagur<input type="date" required value={date} onChange={e => { setDate(e.target.value); setSeasonId(null); setRoles({}) }} /></label>
        <label className="field">Önn<select required value={seasonId} onChange={e => { setSeasonId(e.target.value); setRoles({}) }}><option value="">Veldu önn</option>{seasons.map(s => <option key={s.id} value={s.id}>{s.name} · {s.startsOn} – {s.endsOn}</option>)}</select></label>
        <p>Leikmannastöður miðast við valda önn og dagsetningu. Leiðréttingar hér gilda aðeins fyrir þetta kvöld.</p>
        <div className="summary-table-wrap"><table className="summary-table"><thead><tr><th>Leikmaður</th><th>Lið</th><th>Sett</th><th>Mörk</th><th>Stoðs.</th><th>Staða kvöldsins</th></tr></thead><tbody>{summary.players.map(p => <tr key={p.playerId}><th>{p.name}</th><td>{p.teams}</td><td>{p.setWins}</td><td>{p.goals}</td><td>{p.assists ?? '—'}</td><td>{!roleSeason ? <span>Veldu önn fyrst</span> : <select aria-label={`Staða ${p.name}`} value={roles[p.playerId] ?? roleOnDate(periods, seasonId, p.playerId, date)} onChange={e => setRoles({ ...roles, [p.playerId]: e.target.value as PlayerRole })}><option value="REGULAR">Fastamaður</option><option value="SUBSTITUTE">Varamaður</option></select>}</td></tr>)}</tbody></table></div>
        <button className="primary" disabled={busy || !roleSeason} onClick={() => { if (window.confirm(`Samþykkja kvöldið ${date} í valda önn?`)) void run(() => decide(true)) }}>Samþykkja kvöld</button>
      </> : <p role="alert">Gögnin eru ekki á gildu sniði. Hægt er að hafna skráningunni.</p>}
      <button disabled={busy} onClick={() => { if (window.confirm('Hafna þessari skráningu? Hún mun ekki telja í tölfræði.')) void run(() => decide(false)) }}>Hafna skráningu</button>
      <button disabled={busy} onClick={() => setSelected(null)}>Loka yfirferð</button>
    </article>}
    {message && <p role="status">{message}</p>}
  </section>
}
