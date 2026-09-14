import { useRef, useState } from 'react'
import { db } from '../db/localDb'
import { adjustGameClock, changeCurrentMatchup, pauseGame } from '../data/repository'
import type { Game, SetTeam } from '../domain/types'
import { formatClock } from '../domain/rules'

export function LiveGameEditor({ game, teams, mode, onSaved }: { game: Game; teams: SetTeam[]; mode: 'clock' | 'teams'; onSaved?: () => void }) {
  const [editing, setEditing] = useState<Game | null>(null)
  const [seconds, setSeconds] = useState('')
  const [first, setFirst] = useState('')
  const [second, setSecond] = useState('')
  const [incumbent, setIncumbent] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  async function run(action: () => Promise<void>) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { await action() } catch (e) { setError(e instanceof Error ? e.message : 'Vistun mistókst.') }
    finally { lock.current = false; setBusy(false) }
  }
  if (game.status === 'completed') return null
  const validClock = /^\d+$/.test(seconds) && Number(seconds) > 0 && Number(seconds) <= game.durationSeconds
  return <div className="live-game-editor">
    <button disabled={busy} onClick={() => void run(async () => {
      await pauseGame(game.id)
      const fresh = await db.games.get(game.id)
      if (!fresh || !['ready', 'paused'].includes(fresh.status)) throw new Error('Leikurinn hefur breyst.')
      setEditing(fresh); setSeconds(String(Math.ceil(fresh.remainingSeconds)))
      setFirst(fresh.holderTeamId); setSecond(fresh.challengerTeamId); setIncumbent(fresh.incumbentTeamId ?? '')
    })}>{mode === 'clock' ? '✎ Stilla klukku' : '✎ Breyta liðum á vellinum'}</button>
    {editing && <section className="card live-edit-fields" aria-label={mode === 'clock' ? 'Stilla klukku' : 'Lið á vellinum'}>
      {mode === 'clock' ? <label>Sekúndur eftir (1–{game.durationSeconds})<input type="number" min="1" max={game.durationSeconds} step="1" value={seconds} onChange={e => setSeconds(e.target.value)}/></label> : <>
        <label>Fyrra lið<select value={first} onChange={e => { setFirst(e.target.value); setIncumbent('') }}>{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label>Seinna lið<select value={second} onChange={e => { setSecond(e.target.value); setIncumbent('') }}>{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        {teams.length === 3 && <label>Lengur inni<select value={incumbent} onChange={e => setIncumbent(e.target.value)}><option value="">Óþekkt · velja við jafntefli</option>{teams.filter(t => [first, second].includes(t.id)).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
      </>}
      <p>Klukkan helst í pásu þar til þú heldur áfram.</p>
      <button disabled={busy} onClick={() => setEditing(null)}>Hætta við</button>
      <button className="primary" disabled={busy || (mode === 'clock' ? !validClock : first === second)} onClick={() => void run(async () => {
        if (mode === 'clock') await adjustGameClock(editing.id, Number(seconds), editing.updatedAt)
        else await changeCurrentMatchup(editing.id, first, second, incumbent || null, editing.updatedAt)
        setEditing(null); onSaved?.()
      })}>{mode === 'clock' ? `Staðfesta tíma${validClock ? ` · ${formatClock(Number(seconds))}` : ''}` : 'Vista lið á vellinum'}</button>
    </section>}
    {error && <p role="alert">{error}</p>}
  </div>
}
