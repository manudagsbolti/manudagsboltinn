import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/localDb'
import { createSet, type TeamDraft } from '../data/repository'
import { assignmentBalance, buildSeasonAnalytics, seasonStartYearForDate, weightedRandomAssignments } from '../services/seasonAnalytics'

const TEAM_PRESETS = [
  { name: 'Rautt', color: '#ef4444' },
  { name: 'Blátt', color: '#3b82f6' },
  { name: 'Gult', color: '#facc15' },
]

type SplitMode = 'full' | 'weighted'

export function TeamSetupScreen({ sessionId, onReady, onCancel }: { sessionId: string; onReady: () => void; onCancel: () => void }) {
  const data = useLiveQuery(async () => {
    const session = await db.sessions.get(sessionId)
    if (!session) return null
    const attendance = await db.sessionPlayers.where('sessionId').equals(sessionId).toArray()
    const players = (await db.players.bulkGet(attendance.map(x => x.playerId))).filter(Boolean)
    const sets = await db.sets.where('sessionId').equals(sessionId).sortBy('setNo')
    return {
      session,
      season: session.seasonId ? await db.seasons.get(session.seasonId) : undefined,
      players: players as NonNullable<(typeof players)[number]>[],
      setNo: sets.length + 1,
      analyticsData: {
        players: await db.players.toArray(), sessions: await db.sessions.toArray(), attendance: await db.sessionPlayers.toArray(),
        sets: await db.sets.toArray(), teams: await db.setTeams.toArray(), memberships: await db.setTeamMembers.toArray(),
        games: await db.games.toArray(), goals: await db.goals.toArray(), backfills: await db.sessionBackfills.toArray(),
      },
    }
  }, [sessionId])
  const [teamCount, setTeamCount] = useState(3)
  const [assignments, setAssignments] = useState<Record<string, number>>({})
  const [splitMode, setSplitMode] = useState<SplitMode>('weighted')
  const [stage, setStage] = useState<'roster'|'teams'>('roster')
  const [shuffling, setShuffling] = useState(false)
  const [seededCount, setSeededCount] = useState(false)

  const players = useMemo(() => [...(data?.players ?? [])].sort((a,b)=>a.name.localeCompare(b.name,'is')), [data])
  useEffect(() => {
    if (!seededCount && players.length) { setTeamCount(players.length < 6 ? 2 : 3); setSeededCount(true) }
  }, [players.length, seededCount])

  const seasonYear = data ? seasonStartYearForDate(data.session.playedOn) : seasonStartYearForDate(new Date().toISOString().slice(0,10))
  const analytics = useMemo(() => data ? buildSeasonAnalytics(data.analyticsData, data.season ?? seasonYear, 'ALL') : null, [data, seasonYear])
  const ratings = useMemo(() => new Map(analytics?.players.map(row => [row.playerId, row.rating]) ?? []), [analytics])

  const split = async () => {
    if (!players.length || shuffling) return
    setShuffling(true)
    setStage('teams')
    setAssignments({})
    await new Promise(resolve => setTimeout(resolve, 520))
    const next = splitMode === 'weighted'
      ? weightedRandomAssignments(players.map(p=>p.id), teamCount, ratings)
      : randomAssignments(players.map(p=>p.id), teamCount)
    setAssignments(next)
    setShuffling(false)
  }
  const changeCount = (count: number) => { setTeamCount(count); setAssignments({}); setStage('roster') }
  const counts = Array.from({ length: teamCount }, (_, team) => Object.values(assignments).filter(x => x === team).length)
  const unassigned = players.filter(p => assignments[p.id] === undefined)
  const balanced = counts.every(count => count > 0) && unassigned.length === 0
  const balance = balanced ? assignmentBalance(assignments, teamCount, ratings) : 0

  const confirm = async () => {
    if (!balanced) return
    const drafts: TeamDraft[] = TEAM_PRESETS.slice(0, teamCount).map((team, index) => ({ ...team, playerIds: players.filter(p => assignments[p.id] === index).map(p => p.id) }))
    await createSet(sessionId, drafts)
    onReady()
  }

  if (!data) return <section className="screen loading-screen">Hleð hópnum…</section>

  return <section className="screen page-screen wizard-screen">
    <button className="back-button" onClick={onCancel}>← Til baka</button>
    <div className="section-heading"><div><span className="eyebrow">SETT {data.setNo} · {analytics?.season.name}</span><h1>{stage === 'roster' ? 'Hópurinn í kvöld' : 'Liðin eru klár'}</h1></div>{stage==='teams' && !shuffling && <span className={`balance-badge ${balance>=90?'great':''}`}>⚖ {splitMode==='weighted'?`${balance}% jafnvægi`:'Full random'}</span>}</div>

    {stage === 'roster' ? <>
      <article className="roster-card card">
        <header><div><strong>{players.length} leikmenn valdir</strong><small>Staðfestu hópinn áður en dregið er í lið.</small></div><span>✓</span></header>
        <div className="roster-list">{players.map(player => <div key={player.id} className="roster-player"><span className="choice-avatar">{player.name[0]}</span><div><strong>{player.name}</strong>{player.nickname && <small>{player.nickname}</small>}</div>{splitMode==='weighted' && <em>{ratings.has(player.id) ? `R ${ratings.get(player.id)}` : 'Nýr'}</em>}</div>)}</div>
      </article>

      <div className="subheading"><span>LIÐASKIPTING</span><strong>Hvernig á að draga?</strong></div>
      <div className="segmented team-count"><button className={teamCount === 2 ? 'active' : ''} onClick={() => changeCount(2)}>2 lið</button><button className={teamCount === 3 ? 'active' : ''} onClick={() => changeCount(3)} disabled={players.length < 6}>3 lið</button></div>
      <div className="split-mode-grid">
        <button className={`split-mode card ${splitMode==='weighted'?'selected':''}`} onClick={()=>setSplitMode('weighted')}><span>⚖</span><div><strong>Weighted random</strong><small>Random, en leitast við að jafna lið eftir tölfræði tímabilsins.</small></div><b>{splitMode==='weighted'?'✓':''}</b></button>
        <button className={`split-mode card ${splitMode==='full'?'selected':''}`} onClick={()=>setSplitMode('full')}><span>🎲</span><div><strong>Full random</strong><small>Engin tölfræði. Allir fara hreint í pottinn.</small></div><b>{splitMode==='full'?'✓':''}</b></button>
      </div>
      {splitMode==='weighted' && <div className="weight-note">📈 Styrkleikamat notar stig/sett, settsigra og mörk + stoðsendingar á {analytics?.season.name}. Nýir leikmenn byrja á hlutlausu vægi.</div>}
      <div className="sticky-action"><button className="primary jumbo split-button" onClick={()=>void split()}>⤨ SKIPTA Í LIÐ</button><small>Þú sérð dráttinn eiga sér stað áður en liðin birtast.</small></div>
    </> : <>
      <div className="split-toolbar"><button onClick={()=>{setStage('roster');setAssignments({})}}>← Hópur</button><div className="split-mode-pill">{splitMode==='weighted'?'⚖ Weighted random':'🎲 Full random'}</div><button className="shuffle-button" disabled={shuffling} onClick={()=>void split()}>⤨ Draga aftur</button></div>
      {shuffling ? <div className="shuffle-stage card"><div className="shuffle-orb">⤨</div><h2>Drögum í lið…</h2><div className="shuffle-names">{players.slice(0,6).map((p,i)=><span key={p.id} style={{animationDelay:`${i*70}ms`}}>{p.name}</span>)}</div></div> : <>
        <p className="setup-hint">Liðin eru tillaga. Þú getur fært leikmann handvirkt með litapunktunum áður en settið hefst.</p>
        <div className={`team-setup-grid cols-${teamCount}`}>
          {TEAM_PRESETS.slice(0, teamCount).map((team, teamIndex) => <section className="team-column card" key={team.name} style={{ '--team-color': team.color } as React.CSSProperties}>
            <header><span className="team-dot"/><div><strong>{team.name}</strong><small>{counts[teamIndex]} leikmenn · styrkur {teamStrength(assignments,teamIndex,ratings)}</small></div></header>
            <div className="team-members">
              {players.filter(p => assignments[p.id] === teamIndex).map(player => <div className="assignment-player" key={player.id}><span>{player.name}</span><div className="mini-team-switch">{TEAM_PRESETS.slice(0, teamCount).map((preset, idx) => <button key={preset.name} title={`Færa í ${preset.name}`} className={idx === teamIndex ? 'current' : ''} style={{ background: preset.color }} onClick={() => setAssignments(prev => ({ ...prev, [player.id]: idx }))}/>)}</div></div>)}
            </div>
          </section>)}
        </div>
        {!balanced && <div className="warning-banner">Öll lið þurfa leikmenn og hver leikmaður þarf lið. Lið mega vera misstór.</div>}
        <div className="start-order card"><strong>Upphafsröð</strong><div>{TEAM_PRESETS.slice(0, teamCount).map((team, i) => <span key={team.name}><b style={{ background: team.color }}/>{i === 0 ? `${team.name} inni` : i === 1 ? `${team.name} áskorandi` : `${team.name} bíður`}</span>)}</div></div>
        <div className="sticky-action"><button className="primary jumbo" disabled={!balanced} onClick={() => void confirm()}>Byrja Sett {data.setNo} <span>→</span></button></div>
      </>}
    </>}
  </section>
}

function randomAssignments(ids: string[], teamCount: number): Record<string, number> {
  const shuffled = [...ids].sort(() => Math.random() - 0.5)
  return Object.fromEntries(shuffled.map((id, index) => [id, index % teamCount]))
}
function teamStrength(assignments:Record<string,number>, team:number, ratings:Map<string,number>) {
  const ids=Object.entries(assignments).filter(([,t])=>t===team).map(([id])=>id)
  if(!ids.length) return '—'
  return Math.round(ids.reduce((s,id)=>s+(ratings.get(id)??100),0)/ids.length)
}
