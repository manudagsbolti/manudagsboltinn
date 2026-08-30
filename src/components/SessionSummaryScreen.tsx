import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/localDb'
import { buildSetTeamStats } from '../domain/rules'
import { calculateSessionPlayerStats } from '../services/stats'

export function SessionSummaryScreen({ sessionId, onBack }: { sessionId: string; onBack: () => void }) {
  const data = useLiveQuery(async () => {
    const session = await db.sessions.get(sessionId); if (!session) return null
    const attendance = await db.sessionPlayers.where('sessionId').equals(sessionId).toArray()
    const players = (await db.players.bulkGet(attendance.map(a=>a.playerId))).filter(Boolean) as any[]
    const sets = await db.sets.where('sessionId').equals(sessionId).sortBy('setNo')
    const ids = sets.map(s=>s.id)
    const teams = ids.length ? await db.setTeams.where('setId').anyOf(ids).toArray() : []
    const memberships = ids.length ? await db.setTeamMembers.where('setId').anyOf(ids).toArray() : []
    const games = ids.length ? await db.games.where('setId').anyOf(ids).toArray() : []
    const goals = games.length ? await db.goals.where('gameId').anyOf(games.map(g=>g.id)).toArray() : []
    return { session, players, sets, teams, memberships, games, goals }
  }, [sessionId])
  if (!data) return <section className="screen loading-screen">Hleð samantekt…</section>
  const stats = calculateSessionPlayerStats({ playerIds:data.players.map(p=>p.id), sets:data.sets, teams:data.teams, memberships:data.memberships, games:data.games, goals:data.goals, winsPerPoint:data.session.winsPerPoint, pointsToWinSet:data.session.pointsToWinSet }).sort((a,b)=>b.points-a.points||b.goals-a.goals)
  const name = (id:string)=>data.players.find(p=>p.id===id)?.name ?? '—'
  return <section className="screen page-screen summary-screen">
    <button className="back-button" onClick={onBack}>← Til baka</button>
    <div className="summary-hero"><span className="eyebrow">KVÖLDSAMANTEKT</span><h1>{new Date(`${data.session.playedOn}T12:00:00`).toLocaleDateString('is-IS',{weekday:'long',day:'numeric',month:'long'})}</h1><p>{data.sets.length} sett · {data.players.length} leikmenn · {data.goals.filter(g=>!g.deletedAt).length} mörk</p></div>
    <div className="night-podium">{stats.slice(0,3).map((row,i)=><div key={row.playerId} className={`podium p${i+1}`}><span>{i===0?'🥇':i===1?'🥈':'🥉'}</span><strong>{name(row.playerId)}</strong><b>{row.points} stig</b><small>⚽ {row.goals} · 🅰 {row.assists}</small></div>)}</div>
    <section><div className="subheading"><span>SETTIN</span><strong>Hvað gerðist?</strong></div><div className="set-history">{data.sets.map(set=>{ const teams=data.teams.filter(t=>t.setId===set.id); const games=data.games.filter(g=>g.setId===set.id); const teamStats=buildSetTeamStats(set,teams,games,data.session); return <article className="set-history-card card" key={set.id}><header><strong>Sett {set.setNo}</strong><span>{games.filter(g=>g.winningTeamId).length} litlir sigrar</span></header>{teamStats.sort((a,b)=>b.points-a.points).map(ts=>{const team=teams.find(t=>t.id===ts.teamId)!; const members=data.memberships.filter(m=>m.teamId===team.id).map(m=>name(m.playerId));return <div className={`set-history-team ${ts.isWinner?'winner':''}`} key={team.id}><span className="team-dot" style={{background:team.color}}/><div className="grow"><strong>{team.name}</strong><small>{members.join(' · ')}</small></div><b>{ts.points}</b>{ts.isChoke&&<em>😵</em>}{ts.isZeroPointSet&&<em>🥚</em>}</div>})}</article>})}</div></section>
    <section><div className="subheading"><span>LEIKMENN</span><strong>Kvöldið í tölum</strong></div><div className="stats-table card"><div className="stats-table-head session"><span>#</span><span>Leikmaður</span><span>Stig</span><span>⚽</span><span>🅰</span><span>😵</span><span>🥚</span></div>{stats.map((row,i)=><div className="stats-table-row session" key={row.playerId}><span>{i+1}</span><span className="player-cell"><b>{name(row.playerId)}</b>{row.nixDay&&<small className="nix-label">☠ NIX</small>}</span><strong>{row.points}</strong><span>{row.goals}</span><span>{row.assists}</span><span>{row.chokes}</span><span>{row.zeroPointSets}</span></div>)}</div></section>
  </section>
}
