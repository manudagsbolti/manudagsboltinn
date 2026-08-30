import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/localDb'
import { addPlayer, createSession } from '../data/repository'
import { DEFAULT_RULES } from '../domain/rules'
import { todayIso } from '../utils/id'
import { seasonStartYearForDate, seasonWindow } from '../services/seasonAnalytics'

export function NewSessionScreen({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel: () => void }) {
  const players = useLiveQuery(() => db.players.toArray().then(rows => rows.filter(p => p.isActive).sort((a,b) => a.name.localeCompare(b.name, 'is'))), []) ?? []
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [date, setDate] = useState(todayIso())
  const [showRules, setShowRules] = useState(false)
  const [duration, setDuration] = useState(DEFAULT_RULES.gameDurationSeconds)
  const [winsPerPoint, setWinsPerPoint] = useState(DEFAULT_RULES.winsPerPoint)
  const [pointsToWin, setPointsToWin] = useState(DEFAULT_RULES.pointsToWinSet)
  const [quickName, setQuickName] = useState('')
  const selectedCount = selected.size
  const season = seasonWindow(seasonStartYearForDate(date))
  const allSelected = players.length > 0 && selectedCount === players.length
  const sorted = useMemo(() => [...players].sort((a,b) => a.name.localeCompare(b.name, 'is')), [players])

  const toggle = (id: string) => setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  const quickAdd = async () => {
    if (!quickName.trim()) return
    const player = await addPlayer(quickName)
    setSelected(prev => new Set(prev).add(player.id))
    setQuickName('')
  }
  const next = async () => {
    if (selectedCount < 4) return
    const session = await createSession({ playedOn: date, playerIds: [...selected], gameDurationSeconds: duration, winsPerPoint, pointsToWinSet: pointsToWin })
    onCreated(session.id)
  }

  return <section className="screen page-screen wizard-screen">
    <button className="back-button" onClick={onCancel}>← Til baka</button>
    <div className="section-heading"><div><span className="eyebrow">NÝR LEIKDAGUR</span><h1>Hverjir mæta?</h1></div><span className="count-badge accent">{selectedCount} valdir</span></div>
    <div className="date-row card"><div><label>Dagsetning</label><small className="season-inline">Tímabil {season.name}</small></div><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
    <div className="select-tools"><button onClick={() => setSelected(allSelected ? new Set() : new Set(players.map(p => p.id)))}>{allSelected ? 'Afvelja alla' : 'Velja alla'}</button></div>
    <div className="attendance-grid">
      {sorted.map(player => <button key={player.id} className={`attendance-player ${selected.has(player.id) ? 'selected' : ''}`} onClick={() => toggle(player.id)}>
        <span className="checkmark">{selected.has(player.id) ? '✓' : ''}</span><strong>{player.name}</strong>{player.nickname && <small>{player.nickname}</small>}
      </button>)}
    </div>
    <div className="quick-add card"><input value={quickName} onChange={e => setQuickName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void quickAdd() } }} placeholder="Nýr leikmaður sem mætti í kvöld..."/><button onClick={() => void quickAdd()}>+ Bæta við</button></div>
    <button className="rules-toggle" onClick={() => setShowRules(!showRules)}>⚙ Leikreglur {showRules ? '▲' : '▼'}</button>
    {showRules && <div className="rules-card card">
      <div className="field"><label>Lengd leiks</label><select value={duration} onChange={e => setDuration(Number(e.target.value))}><option value={120}>2 mín</option><option value={180}>3 mín</option><option value={240}>4 mín</option></select></div>
      <div className="field"><label>Litlir sigrar í stig</label><input type="number" min={1} max={10} value={winsPerPoint} onChange={e => setWinsPerPoint(Number(e.target.value))}/></div>
      <div className="field"><label>Stig til að vinna sett</label><input type="number" min={2} max={10} value={pointsToWin} onChange={e => setPointsToWin(Number(e.target.value))}/></div>
    </div>}
    <div className="sticky-action"><button className="primary jumbo" disabled={selectedCount < 4} onClick={() => void next()}>Áfram <span>→</span></button><small>{selectedCount < 4 ? 'Veldu a.m.k. 4 leikmenn' : `Næst: staðfesta ${selectedCount} manna hóp og skipta í lið`}</small></div>
  </section>
}
