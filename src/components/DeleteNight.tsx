import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/localDb'
import { deleteSession, pauseGame } from '../data/repository'
import { cachedAccess } from '../services/access'

export function DeleteNight({ sessionId, onDeleted }: { sessionId: string; onDeleted: () => void }) {
  const data = useLiveQuery(async () => ({ session: await db.sessions.get(sessionId), submission: await db.submissions.get(sessionId) }), [sessionId])
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const recorder = cachedAccess()?.role === 'recorder'
  if (!data?.session || (recorder && data.submission)) return null
  return <div className="delete-night">
    <button className="recorder-button" disabled={busy} onClick={async () => {
      setBusy(true); setError('')
      try {
        const sets = await db.sets.where('sessionId').equals(sessionId).toArray()
        const games = await db.games.where('setId').anyOf(sets.map(s => s.id)).toArray()
        for (const game of games.filter(g => g.status === 'live')) await pauseGame(game.id)
        setConfirmation(''); setOpen(true)
      } catch { setError('Ekki tókst að undirbúa eyðingu. Reyndu aftur.') }
      finally { setBusy(false) }
    }}>Eyða kvöldi</button>
    {error && <p role="alert">{error}</p>}
    {open && <div className="modal-backdrop"><section className="card delete-night-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-night-title">
      <h2 id="delete-night-title">Eyða þessu kvöldi?</h2>
      <strong>{new Date(`${data.session.playedOn}T12:00:00`).toLocaleDateString('is-IS', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>
      <p>Öllum leikjum, mörkum og skráningum þessa kvölds verður eytt. Önnur kvöld og leikmenn haldast. Ekki er hægt að afturkalla eyðinguna.</p>
      {data.session.status === 'live' && <p>Klukkan hefur verið sett í pásu. Ef þú hættir við geturðu haldið leiknum áfram.</p>}
      <form onSubmit={async e => {
        e.preventDefault(); if (busy || confirmation !== 'EYÐA') return
        setBusy(true); setError('')
        try { await deleteSession(sessionId, true); onDeleted() }
        catch (e) { setError(e instanceof Error ? e.message : 'Eyðing mistókst.') }
        finally { setBusy(false) }
      }}>
        <label className="field">Sláðu inn EYÐA til að staðfesta<input autoFocus value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off"/></label>
        {error && <p role="alert">{error}</p>}
        <div className="delete-night-buttons"><button type="button" className="recorder-button" disabled={busy} onClick={() => setOpen(false)}>Hætta við</button><button className="recorder-button delete-night-confirm" disabled={busy || confirmation !== 'EYÐA'}>{busy ? 'Eyði…' : 'Staðfesta eyðingu'}</button></div>
      </form>
    </section></div>}
  </div>
}
