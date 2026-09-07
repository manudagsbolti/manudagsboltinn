import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/localDb'
import { supabase } from '../lib/supabase'
import { syncCloud } from '../services/cloudSync'
import { todayIso } from '../utils/id'

export function RecordingAccess() {
  const seasons = useLiveQuery(() => db.seasons.toArray(), []) ?? []
  const [date, setDate] = useState(todayIso())
  const [season, setSeason] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (!supabase) return
    void supabase.from('recording_window').select('*').maybeSingle().then(({ data, error }) => {
      if (error) setMessage('Ekki tókst að sækja skráningarheimildir. Athugaðu uppsetningu.')
      if (data) { setDate(data.played_on); setSeason(data.season_id); setOpen(data.is_open) }
    })
  }, [])
  const save = async () => {
    if (!supabase) return
    setBusy(true); setMessage('')
    try {
      await syncCloud()
      const { error } = await supabase.rpc('set_recording_window', { night: date, season, open })
      if (error) throw new Error('Ekki tókst að vista. Dagsetning þarf að vera innan valinnar annar og stjórnandaaðgangur virkur.')
      setMessage(open ? 'Kvöldið er opið fyrir skráningu.' : 'Skráningaraðgangur að kvöldinu er lokaður.')
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Vistun mistókst.') }
    finally { setBusy(false) }
  }
  return <article className="card auth-card"><h2>Aðgangur að leikskráningu</h2>
    <p>Sameiginlega lykilorðið opnar aðeins valið kvöld. Samstillið skráningartækið áður en kvöldi er lokað eða skipt um dagsetningu.</p>
    <label className="field">Dagsetning<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
    <label className="field">Önn<select value={season} onChange={e => setSeason(e.target.value)}><option value="">Veldu önn</option>{seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <label><input type="checkbox" checked={open} onChange={e => setOpen(e.target.checked)} /> Opna fyrir skráningu</label>
    <button className="primary" disabled={busy || !season} onClick={() => { void save() }}>Vista aðgang</button>
    {message && <p role="status">{message}</p>}
  </article>
}
