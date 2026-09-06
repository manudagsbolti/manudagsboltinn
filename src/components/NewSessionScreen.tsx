import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/localDb'
import { addPlayer, createSession, roleOnDate } from '../data/repository'
import { DEFAULT_RULES } from '../domain/rules'
import { todayIso } from '../utils/id'
import { defaultSeasonForDate } from '../domain/seasons'

export function NewSessionScreen({ onCreated, onCancel, recordingDate, recordingSeasonId }: { onCreated: (id: string) => void; onCancel: () => void; recordingDate?: string; recordingSeasonId?: string }) {
  const players = useLiveQuery(() => db.players.toArray().then(rows => rows.filter(p => p.isActive)), []) ?? []
  const rolePeriods = useLiveQuery(() => db.rolePeriods.toArray(), []) ?? []
  const seasons = useLiveQuery(() => db.seasons.toArray(), []) ?? []
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [date, setDate] = useState(recordingDate ?? todayIso())
  const [seasonId, setSeasonId] = useState(recordingSeasonId ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [quickName, setQuickName] = useState('')
  const selectedCount = selected.size
  const season = defaultSeasonForDate(date)
  const persistedSeason = seasonId ? seasons.find(item => item.id === seasonId) : seasons.find(item => item.startsOn <= date && (!item.endsOn || item.endsOn >= date))
  const allSelected = players.length > 0 && selectedCount === players.length
  const role = (playerId: string) => persistedSeason ? roleOnDate(rolePeriods, persistedSeason.id, playerId, date) : 'SUBSTITUTE'
  const sorted = useMemo(() => [...players].sort((a,b) => role(a.id).localeCompare(role(b.id)) || a.name.localeCompare(b.name, 'is')), [players, rolePeriods, persistedSeason?.id, date])

  const toggle = (id: string) => setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  const quickAdd = async () => {
    if (!quickName.trim()) return
    const player = await addPlayer(quickName)
    setSelected(prev => new Set(prev).add(player.id))
    setQuickName('')
  }
  const next = async () => {
    if (selectedCount < 4 || busy) return
    setBusy(true); setError('')
    try {
    if (recordingDate && !persistedSeason) throw new Error('Sæktu kvöldið á forsíðunni áður en mæting er valin.')
    const session = await createSession({ seasonId: persistedSeason?.id, playedOn: date, playerIds: [...selected], gameDurationSeconds: DEFAULT_RULES.gameDurationSeconds, winsPerPoint: DEFAULT_RULES.winsPerPoint, pointsToWinSet: DEFAULT_RULES.pointsToWinSet })
    onCreated(session.id)
    } catch (e) { setError(e instanceof Error ? e.message : 'Vistun mistókst.') } finally { setBusy(false) }
  }

  return <section className="screen page-screen wizard-screen">
    <button className="back-button" onClick={onCancel}>← Til baka</button>
    <div className="section-heading"><div><span className="eyebrow">NÝR LEIKDAGUR</span><h1>Hverjir mæta?</h1></div><span className="count-badge accent">{selectedCount} valdir</span></div>
    {recordingDate ? <p>Dagsetning: {recordingDate}</p> : <>
      <div className="date-row card"><div><label>Dagsetning</label><small className="season-inline">Tímabil {persistedSeason?.name ?? season?.name ?? 'Sumarfrí'}</small></div><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
      <label className="field">Önn<select value={seasonId} onChange={e => setSeasonId(e.target.value)}><option value="">Sjálfvirkt eftir dagsetningu</option>{seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    </>}
    {error && <p role="alert" className="warning-banner">{error}</p>}
    <div className="select-tools"><button onClick={() => setSelected(allSelected ? new Set() : new Set(players.map(p => p.id)))}>{allSelected ? 'Afvelja alla' : 'Velja alla'}</button></div>
    <div className="attendance-grid">
      {sorted.map(player => <button key={player.id} className={`attendance-player ${selected.has(player.id) ? 'selected' : ''}`} onClick={() => toggle(player.id)}>
        <span className="checkmark">{selected.has(player.id) ? '✓' : ''}</span><strong>{player.name}</strong>{role(player.id) === 'SUBSTITUTE' && <small className="role-badge">V</small>}{player.nickname && <small>{player.nickname}</small>}
      </button>)}
    </div>
    <div className="quick-add card"><input value={quickName} onChange={e => setQuickName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void quickAdd() } }} placeholder="Nýr leikmaður sem mætti í kvöld..."/><button onClick={() => void quickAdd()}>+ Bæta við</button></div>
    <div className="rules-card card">Leikir eru 03:00 · Fyrsta lið í 4 sigra vinnur sett.</div>
    <div className="sticky-action"><button className="primary jumbo" disabled={busy || selectedCount < 4} onClick={() => void next()}>Áfram <span>→</span></button><small>{selectedCount < 4 ? 'Veldu a.m.k. 4 leikmenn' : `Næst: staðfesta ${selectedCount} manna hóp og skipta í lið`}</small></div>
  </section>
}
