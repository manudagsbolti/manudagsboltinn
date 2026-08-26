import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { createSession } from '../domain/gameEngine'
import { roleAtDate } from '../domain/roles'
import type { PlayerRole, SessionPlayer, SessionTeam, TeamCode } from '../domain/types'
import { RoleBadge } from '../components/RoleBadge'

const codes: TeamCode[] = ['A', 'B', 'C']

export function SessionSetupScreen({ onCancel, onCreated }: { onCancel: () => void; onCreated: (sessionId: string) => void }) {
  const { state, selectedSeason, addPlayer, addSession } = useApp()
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [selected, setSelected] = useState<Record<string, PlayerRole>>({})
  const [teamCount, setTeamCount] = useState<2 | 3>(3)
  const [assignments, setAssignments] = useState<Record<string, TeamCode>>({})
  const [waitingTeam, setWaitingTeam] = useState<TeamCode>('C')
  const [newSubName, setNewSubName] = useState('')

  if (!selectedSeason) return <main className="page"><p>Engin önn valin.</p><button onClick={onCancel}>Til baka</button></main>
  const season = selectedSeason

  const activePlayers = state.players.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name, 'is'))
  const regulars = activePlayers.filter((p) => roleAtDate(state.rolePeriods, season.id, p.id, date) === 'REGULAR')
  const substitutes = activePlayers.filter((p) => roleAtDate(state.rolePeriods, season.id, p.id, date) === 'SUBSTITUTE')
  const selectedIds = Object.keys(selected)

  function togglePlayer(playerId: string, defaultRole: PlayerRole) {
    setSelected((current) => {
      const next = { ...current }
      if (next[playerId]) delete next[playerId]
      else next[playerId] = defaultRole
      return next
    })
  }

  function addQuickSub() {
    const name = newSubName.trim()
    if (!name) return
    const existing = activePlayers.find((p) => p.name.toLocaleLowerCase('is') === name.toLocaleLowerCase('is'))
    const player = existing ?? addPlayer(name)
    setSelected((s) => ({ ...s, [player.id]: 'SUBSTITUTE' }))
    setNewSubName('')
  }

  function goToTeams() {
    const next = { ...assignments }
    selectedIds.forEach((id, index) => { if (!next[id]) next[id] = codes[index % teamCount] })
    setAssignments(next)
    setStep(2)
  }

  const teamSizes = useMemo(() => {
    const out: Record<TeamCode, number> = { A: 0, B: 0, C: 0 }
    selectedIds.forEach((id) => { const team = assignments[id]; if (team) out[team] += 1 })
    return out
  }, [assignments, selectedIds.join('|')])

  function create() {
    const activeCodes = codes.slice(0, teamCount)
    if (!selectedIds.length || selectedIds.some((id) => !activeCodes.includes(assignments[id]))) return
    const teams: SessionTeam[] = activeCodes.map((code) => ({ id: crypto.randomUUID(), code }))
    const players: SessionPlayer[] = selectedIds.map((playerId) => ({
      id: crypto.randomUUID(), playerId, roleAtSession: selected[playerId], teamCode: assignments[playerId], present: true,
    }))
    const waiting = teamCount === 3 ? waitingTeam : null
    const opening = activeCodes.filter((c) => c !== waiting)
    const session = createSession({
      seasonId: season.id,
      sessionDate: date,
      teamCount,
      teams,
      players,
      openingTeam1: opening[0],
      openingTeam2: opening[1],
    })
    addSession(session)
    onCreated(session.id)
  }

  return <main className="page setup-page">
    <header className="page-header">
      <div><p className="eyebrow">NÝTT KVÖLD</p><h1>{step === 1 ? 'Mæting' : step === 2 ? 'Lið' : 'Tilbúið'}</h1></div>
      <button className="ghost small" onClick={onCancel}>Hætta</button>
    </header>
    <div className="stepper"><span className={step >= 1 ? 'active' : ''}>1</span><i/><span className={step >= 2 ? 'active' : ''}>2</span><i/><span className={step >= 3 ? 'active' : ''}>3</span></div>

    {step === 1 && <>
      <label className="field"><span>Dagsetning</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <section className="section-block">
        <div className="section-heading"><h2>Fastamenn</h2><span>{regulars.length}</span></div>
        <div className="check-list">
          {regulars.map((p) => <button key={p.id} className={`check-row ${selected[p.id] ? 'selected' : ''}`} onClick={() => togglePlayer(p.id, 'REGULAR')}>
            <span className="check-dot">{selected[p.id] ? '✓' : ''}</span><span>{p.name}</span><RoleBadge role="REGULAR" />
          </button>)}
        </div>
      </section>
      <section className="section-block">
        <div className="section-heading"><h2>Varamenn</h2><span>{substitutes.length}</span></div>
        <div className="quick-add"><input placeholder="Nafn varamanns" value={newSubName} onChange={(e) => setNewSubName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addQuickSub()} /><button className="secondary" onClick={addQuickSub}>＋ Bæta við</button></div>
        <div className="check-list compact-list">
          {substitutes.map((p) => <button key={p.id} className={`check-row ${selected[p.id] ? 'selected' : ''}`} onClick={() => togglePlayer(p.id, 'SUBSTITUTE')}>
            <span className="check-dot">{selected[p.id] ? '✓' : ''}</span><span>{p.name}</span><RoleBadge role="SUBSTITUTE" />
          </button>)}
        </div>
      </section>
      <div className="sticky-action"><span>{selectedIds.length} mæta</span><button className="primary" disabled={selectedIds.length < 4} onClick={goToTeams}>Áfram →</button></div>
    </>}

    {step === 2 && <>
      <section className="choice-card">
        <h2>Fjöldi liða</h2>
        <div className="segmented"><button className={teamCount === 2 ? 'active' : ''} onClick={() => setTeamCount(2)}>2 lið</button><button className={teamCount === 3 ? 'active' : ''} onClick={() => setTeamCount(3)}>3 lið</button></div>
        <p className="muted">Lið þurfa ekki að vera jafnstór. 4v4, 4v4v5 og 5v5v5 eru öll gild.</p>
      </section>
      <div className={`team-builder teams-${teamCount}`}>
        {codes.slice(0, teamCount).map((code) => <section key={code} className="team-builder-column">
          <header><strong>Lið {code}</strong><span>{teamSizes[code]}</span></header>
          {selectedIds.filter((id) => assignments[id] === code).map((id) => {
            const player = state.players.find((p) => p.id === id)!
            return <div key={id} className="assigned-player"><span>{player.name}</span><RoleBadge role={selected[id]} /><select value={code} onChange={(e) => setAssignments((a) => ({ ...a, [id]: e.target.value as TeamCode }))}>{codes.slice(0, teamCount).map((c) => <option key={c}>{c}</option>)}</select></div>
          })}
        </section>)}
      </div>
      <div className="sticky-action"><button className="ghost" onClick={() => setStep(1)}>← Til baka</button><button className="primary" onClick={() => setStep(3)}>Áfram →</button></div>
    </>}

    {step === 3 && <>
      {teamCount === 3 && <section className="choice-card"><h2>Hvaða lið bíður fyrst?</h2><div className="segmented three">{codes.map((c) => <button key={c} className={waitingTeam === c ? 'active' : ''} onClick={() => setWaitingTeam(c)}>Lið {c}</button>)}</div></section>}
      <section className="ready-card">
        <p className="eyebrow">{season.name} · {date}</p>
        <h2>{teamCount === 3 ? `${codes.filter((c) => c !== waitingTeam).join(' vs ')} byrja` : 'A vs B byrja'}</h2>
        {teamCount === 3 && <p>Lið {waitingTeam} bíður.</p>}
        <div className={`mini-team-grid teams-${teamCount}`}>{codes.slice(0, teamCount).map((code) => <div key={code}><strong>Lið {code}</strong><span>{teamSizes[code]} leikmenn</span></div>)}</div>
      </section>
      <div className="sticky-action"><button className="ghost" onClick={() => setStep(2)}>← Til baka</button><button className="primary" onClick={create}>▶ Stofna kvöld</button></div>
    </>}
  </main>
}
