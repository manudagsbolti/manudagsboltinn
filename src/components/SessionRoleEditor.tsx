import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/localDb'
import { correctSessionPlayerRole } from '../data/repository'
import type { PlayerRole } from '../domain/types'

const label = (role: PlayerRole) => role === 'REGULAR' ? 'Fastamaður' : 'Varamaður'
export function SessionRoleEditor({ sessionId }: { sessionId: string }) {
  const rows = useLiveQuery(() => db.sessionPlayers.where('sessionId').equals(sessionId).toArray(), [sessionId]) ?? []
  const players = useLiveQuery(() => db.players.toArray(), []) ?? []
  const [playerId, setPlayerId] = useState('')
  const [role, setRole] = useState<PlayerRole>('REGULAR')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const row = rows.find(r => r.playerId === playerId)
  return <details className="card season-context"><summary>Leiðrétta leikmannastöður</summary>
    <p>Þetta breytir aðeins stöðu í þessu kvöldi. Mörk og sigrar færast milli fastamanna- og varamannatölfræði. Önnur kvöld og almenn staða leikmannsins haldast.</p>
    {rows.map(r => <div key={r.playerId}><strong>{players.find(p => p.id === r.playerId)?.name ?? 'Leikmaður'}</strong> · {label(r.roleAtSession)}
      <button type="button" onClick={() => { setPlayerId(r.playerId); setRole(r.roleAtSession === 'REGULAR' ? 'SUBSTITUTE' : 'REGULAR'); setReason(''); setMessage('') }}>Leiðrétta</button>
      {!!r.roleCorrections?.length && <details><summary>Breytingasaga ({r.roleCorrections.length})</summary><ul>{r.roleCorrections.map((c, i) => <li key={i}>{new Date(c.correctedAt).toLocaleString('is-IS')} · {label(c.fromRole)} → {label(c.toRole)} · {c.reason}</li>)}</ul></details>}
    </div>)}
    {row && <form onSubmit={async e => { e.preventDefault(); if (busy) return; setBusy(true); setMessage(''); try { await correctSessionPlayerRole(sessionId, playerId, role, reason); setPlayerId(''); setMessage('Staða kvöldsins leiðrétt og breytingasaga vistuð.'); } catch (e) { setMessage(e instanceof Error ? e.message : 'Vistun mistókst.') } finally { setBusy(false) } }}>
      <h3>{players.find(p => p.id === playerId)?.name}</h3>
      <p>Nú skráð: {label(row.roleAtSession)}</p>
      <label className="field">Rétt staða<select value={role} onChange={e => setRole(e.target.value as PlayerRole)}><option value="REGULAR">Fastamaður</option><option value="SUBSTITUTE">Varamaður</option></select></label>
      <label className="field">Ástæða leiðréttingar<input required value={reason} onChange={e => setReason(e.target.value)} /></label>
      <button className="primary" disabled={busy || role === row.roleAtSession || !reason.trim()}>Staðfesta leiðréttingu</button><button type="button" disabled={busy} onClick={() => setPlayerId('')}>Hætta við</button>
    </form>}
    {message && <p role="status">{message}</p>}
  </details>
}
