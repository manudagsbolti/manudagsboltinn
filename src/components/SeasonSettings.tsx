import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/localDb'
import { saveSeason } from '../data/repository'
import { defaultSeasonForDate } from '../domain/seasons'
import { todayIso } from '../utils/id'

export function SeasonSettings() {
  const seasons = useLiveQuery(() => db.seasons.orderBy('startsOn').reverse().toArray(), []) ?? []
  const initial = defaultSeasonForDate(todayIso()) ?? defaultSeasonForDate(`${new Date().getFullYear()}-09-01`)!
  const [selected, setSelected] = useState('')
  const [form, setForm] = useState(initial)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const choose = (id: string) => {
    setSelected(id); setMessage('')
    const season = seasons.find(s => s.id === id)
    setForm(season ? { name: season.name, startsOn: season.startsOn, endsOn: season.endsOn ?? season.startsOn } : initial)
  }
  return <details className="card season-settings"><summary>Annir · velja og breyta dagsetningum</summary>
    <p>Sjálfgefið: september–desember og janúar–apríl. Maí–ágúst er frí. Þú getur stofnað eða breytt önn með eigin dagsetningum.</p>
    <label className="field">Önn<select value={selected} onChange={e => choose(e.target.value)}><option value="">Ný önn</option>{seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <form onSubmit={async e => { e.preventDefault(); if (busy) return; setBusy(true); setMessage(''); try { const s = await saveSeason({ ...form, id: selected || undefined }); setSelected(s.id); setMessage('Önn vistuð. Fyrri kvöld halda sinni önn og hlutverkum.'); } catch (e) { setMessage(e instanceof Error ? e.message : 'Vistun mistókst.') } finally { setBusy(false) } }}>
      {!selected && <div className="night-actions">{['01','09'].map(month => <button type="button" key={month} onClick={() => setForm(defaultSeasonForDate(`${form.startsOn.slice(0,4)}-${month}-01`)!)}>{month === '01' ? 'Vor · jan–apr' : 'Haust · sep–des'}</button>)}</div>}
      <label className="field">Nafn<input required value={form.name} onChange={e => setForm({ ...form, name:e.target.value })}/></label>
      <label className="field">Frá<input required type="date" value={form.startsOn} onChange={e => setForm({ ...form, startsOn:e.target.value })}/></label>
      <label className="field">Til<input required type="date" value={form.endsOn} onChange={e => setForm({ ...form, endsOn:e.target.value })}/></label>
      <button className="primary jumbo" disabled={busy}>Vista önn</button>
    </form><p role="status">{message}</p>
  </details>
}
