import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { createHistoricalSession, roleOnDate } from '../data/repository'
import { db } from '../db/localDb'
import type { SessionBackfill } from '../domain/types'
import { todayIso } from '../utils/id'
import { SeasonContext, displayDate } from './SeasonContext'

const TEAMS = [
  { code: 'A' as const, name: 'Blátt', color: '#3b82f6' },
  { code: 'B' as const, name: 'Grænt', color: '#22c55e' },
  { code: 'C' as const, name: 'Mislit', color: '#a855f7' },
]

export function HistoricalSessionScreen({ onSaved, onCancel }: { onSaved: (sessionId: string) => void; onCancel: () => void }) {
  const players = useLiveQuery(() => db.players.toArray().then(rows => rows.filter(player => player.isActive).sort((a,b) => a.name.localeCompare(b.name, 'is'))), []) ?? []
  const [date, setDate] = useState(todayIso())
  const seasons = useLiveQuery(() => db.seasons.toArray(), []) ?? []
  const periods = useLiveQuery(() => db.rolePeriods.toArray(), []) ?? []
  const season = seasons.filter(s => s.startsOn <= date && (!s.endsOn || s.endsOn >= date)).sort((a,b) => Number(b.isActive) - Number(a.isActive))[0]
  const role = (playerId: string) => season ? roleOnDate(periods, season.id, playerId, date) : 'SUBSTITUTE'
  const [teamCount, setTeamCount] = useState<2 | 3>(3)
  const [assignments, setAssignments] = useState<Record<string, 'A' | 'B' | 'C' | undefined>>({})
  const [rounds, setRounds] = useState<Array<Record<'A' | 'B' | 'C', number>>>([{ A: 0, B: 0, C: 0 }])
  const [goals, setGoals] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const activeTeams = TEAMS.slice(0, teamCount)
  const assignedPlayers = players.filter(player => assignments[player.id])
  const teamGoalTotal = rounds.reduce((sum, round) => sum + activeTeams.reduce((teamSum, team) => teamSum + (round[team.code] || 0), 0), 0)
  const playerGoalTotal = Object.values(goals).reduce((sum, value) => sum + (value || 0), 0)
  const emptyTeams = activeTeams.filter(team => !players.some(player => assignments[player.id] === team.code))
  const valid = assignedPlayers.length >= teamCount * 2 && emptyTeams.length === 0 && teamGoalTotal === playerGoalTotal && teamGoalTotal > 0

  const teamDrafts = useMemo<SessionBackfill['teams']>(() => activeTeams.map(team => ({
    ...team, playerIds: players.filter(player => assignments[player.id] === team.code).map(player => player.id),
  })), [players, assignments, teamCount])

  const save = async () => {
    if (!valid || saving) return
    setSaving(true)
    try {
      const session = await createHistoricalSession({
        playedOn: date,
        teams: teamDrafts,
        rounds: rounds.map((round, index) => ({ roundNo: index + 1, teamGoals: Object.fromEntries(activeTeams.map(team => [team.code, round[team.code] || 0])) })),
        playerGoals: assignedPlayers.map(player => ({ playerId: player.id, goals: goals[player.id] || 0 })),
      })
      onSaved(session.id)
    } finally { setSaving(false) }
  }

  const setTeamCountSafe = (count: 2 | 3) => {
    setTeamCount(count)
    if (count === 2) setAssignments(current => Object.fromEntries(Object.entries(current).map(([id, code]) => [id, code === 'C' ? undefined : code])))
  }

  return <section className="screen page-screen historical-screen">
    <button className="back-button" onClick={onCancel}>← Til baka</button>
    <div className="section-heading"><div><span className="eyebrow">HANDSKRÁNING</span><h1>Handskrá kvöld</h1></div><span className="count-badge">Samantektargögn</span></div>
    <p className="historical-intro">Notaðu þetta þegar kvöld var ekki skráð í Live Mode. Skráðu aðeins það sem þið vitið; kerfið býr ekki til tilbúna leikjaröð eða stoðsendingar.</p>

    <div className="date-row card"><label htmlFor="historical-date">Dagsetning kvöldsins</label><input id="historical-date" type="date" value={date} onChange={event => setDate(event.target.value)} /></div>
    <SeasonContext date={date} />
    <div className="segmented team-count"><button className={teamCount === 2 ? 'active' : ''} onClick={() => setTeamCountSafe(2)}>2 lið</button><button className={teamCount === 3 ? 'active' : ''} onClick={() => setTeamCountSafe(3)}>3 lið</button></div>

    <div className="subheading"><span>LIÐASKIPAN</span><strong>Hverjir voru saman?</strong></div>
    <div className="historical-roster card">
      {players.map(player => <div className="historical-player" key={player.id}><div><strong>{player.name}</strong><small className={`role-badge ${role(player.id) === 'REGULAR' ? 'regular' : 'substitute'}`}>{role(player.id) === 'REGULAR' ? 'F · Fastamaður' : 'V · Varamaður'}</small></div><div>{activeTeams.map(team => <button key={team.code} className={assignments[player.id] === team.code ? 'selected' : ''} style={{ '--team-color': team.color } as React.CSSProperties} onClick={() => setAssignments(current => ({ ...current, [player.id]: current[player.id] === team.code ? undefined : team.code }))}>{team.code}</button>)}</div></div>)}
      {!players.length && <div className="empty-state compact">Bættu leikmönnum fyrst við undir Leikmenn.</div>}
    </div>

    <div className="subheading"><span>UMFERÐIR / SETT</span><strong>Mörk eftir liðum</strong></div>
    <div className="historical-rounds">
      {rounds.map((round, roundIndex) => <article className="historical-round card" key={roundIndex}><header><strong>Umferð {roundIndex + 1}</strong>{rounds.length > 1 && <button onClick={() => setRounds(current => current.filter((_, index) => index !== roundIndex))}>Fjarlægja</button>}</header><div>{activeTeams.map(team => <label key={team.code} style={{ '--team-color': team.color } as React.CSSProperties}><span className="team-dot" />{team.name}<input type="number" min={0} inputMode="numeric" value={round[team.code]} onChange={event => setRounds(current => current.map((item, index) => index === roundIndex ? { ...item, [team.code]: Math.max(0, Number(event.target.value)) } : item))} /></label>)}</div></article>)}
      <button className="add-round-button" onClick={() => setRounds(current => [...current, { A: 0, B: 0, C: 0 }])}>+ Bæta við umferð</button>
    </div>

    <div className="subheading"><span>MARKASKORARAR</span><strong>Hverjir skoruðu?</strong></div>
    <div className="historical-scorers card">{assignedPlayers.map(player => <label key={player.id}><span><i style={{ background: activeTeams.find(team => team.code === assignments[player.id])?.color }} />{player.name}</span><input type="number" min={0} inputMode="numeric" value={goals[player.id] || 0} onChange={event => setGoals(current => ({ ...current, [player.id]: Math.max(0, Number(event.target.value)) }))} /></label>)}</div>

    <div className={`historical-balance ${teamGoalTotal === playerGoalTotal ? 'ok' : ''}`}><span>Liðsmörk <b>{teamGoalTotal}</b></span><span>Leikmannamörk <b>{playerGoalTotal}</b></span><strong>{teamGoalTotal === playerGoalTotal ? '✓ Stemmir' : `${Math.abs(teamGoalTotal - playerGoalTotal)} marka munur`}</strong></div>
    {emptyTeams.length > 0 && <div className="warning-banner">Öll liðin þurfa leikmenn.</div>}
    <div className="sticky-action"><strong>Kvöldið verður skráð {displayDate(date)}</strong><button className="primary jumbo" disabled={!valid || saving} onClick={() => void save()}>{saving ? 'Vista…' : 'Vista handskráð kvöld'} <span>→</span></button><small>Stoðsendingar verða merktar óskráðar, ekki sem engar stoðsendingar.</small></div>
  </section>
}
