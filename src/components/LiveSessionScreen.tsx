import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/localDb'
import { completeSession, createNextGame, createSet, pauseGame, recordGoal, resumeGame, startGame, timeoutGame, undoGoal, type TeamDraft } from '../data/repository'
import { buildSetTeamStats, currentRemainingSeconds, formatClock } from '../domain/rules'
import { calculateSessionPlayerStats } from '../services/stats'
import { playBuzzer } from '../utils/audio'
import { GoalModal } from './GoalModal'
import { SetScoreboard } from './SetScoreboard'

export function LiveSessionScreen({ sessionId, onReshuffle, onFinish, onBack }: {
  sessionId: string
  onReshuffle: () => void
  onFinish: () => void
  onBack: () => void
}) {
  const data = useLiveQuery(async () => {
    const session = await db.sessions.get(sessionId)
    if (!session) return null
    const sets = await db.sets.where('sessionId').equals(sessionId).sortBy('setNo')
    const setIds = sets.map(s => s.id)
    const teams = setIds.length ? await db.setTeams.where('setId').anyOf(setIds).toArray() : []
    const memberships = setIds.length ? await db.setTeamMembers.where('setId').anyOf(setIds).toArray() : []
    const games = setIds.length ? await db.games.where('setId').anyOf(setIds).toArray() : []
    const gameIds = games.map(g => g.id)
    const goals = gameIds.length ? await db.goals.where('gameId').anyOf(gameIds).toArray() : []
    const attendance = await db.sessionPlayers.where('sessionId').equals(sessionId).toArray()
    const players = (await db.players.bulkGet(attendance.map(a => a.playerId))).filter(Boolean)
    return { session, sets, teams, memberships, games, goals, players: players as NonNullable<(typeof players)[number]>[] }
  }, [sessionId])

  const [goalTeamId, setGoalTeamId] = useState<string | null>(null)
  const [tick, setTick] = useState(Date.now())
  const buzzerFor = useRef<string | null>(null)

  const currentSet = data?.sets.at(-1)
  const setTeams = useMemo(() => data && currentSet ? data.teams.filter(t => t.setId === currentSet.id).sort((a,b) => a.sortOrder - b.sortOrder) : [], [data, currentSet])
  const setGames = useMemo(() => data && currentSet ? data.games.filter(g => g.setId === currentSet.id).sort((a,b) => a.gameNo - b.gameNo) : [], [data, currentSet])
  const currentGame = setGames.at(-1)
  const activeGoal = currentGame && data ? data.goals.find(g => g.gameId === currentGame.id && !g.deletedAt) : undefined
  const remaining = currentGame ? currentRemainingSeconds(currentGame, tick) : 0

  useEffect(() => {
    if (currentGame?.status !== 'live') return
    const timer = window.setInterval(() => setTick(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [currentGame?.id, currentGame?.status])

  useEffect(() => {
    if (!currentGame || currentGame.status !== 'live' || remaining > 0 || buzzerFor.current === currentGame.id) return
    buzzerFor.current = currentGame.id
    playBuzzer()
    void timeoutGame(currentGame.id)
  }, [currentGame, remaining])

  if (!data || !currentSet || !currentGame) return <div className="screen loading-screen">Hleð leikdegi…</div>
  const { session, players } = data
  const holder = setTeams.find(t => t.id === currentGame.holderTeamId)!
  const challenger = setTeams.find(t => t.id === currentGame.challengerTeamId)!
  const waiting = setTeams.find(t => t.id === currentGame.waitingTeamId)
  const goalTeam = setTeams.find(t => t.id === goalTeamId)
  const membersForGoalTeam = goalTeam ? data.memberships.filter(m => m.teamId === goalTeam.id).map(m => players.find(p => p.id === m.playerId)).filter(Boolean) as typeof players : []
  const setStats = buildSetTeamStats(currentSet, setTeams, setGames, session)
  const allStats = calculateSessionPlayerStats({
    playerIds: players.map(p => p.id), sets: data.sets, teams: data.teams, memberships: data.memberships, games: data.games, goals: data.goals,
    winsPerPoint: session.winsPerPoint, pointsToWinSet: session.pointsToWinSet,
  }).sort((a,b) => b.points - a.points || b.goals - a.goals)

  const saveGoal = async (scorerId: string, assistId: string | null) => {
    if (!goalTeam) return
    await recordGoal({ gameId: currentGame.id, teamId: goalTeam.id, scorerPlayerId: scorerId, assistPlayerId: assistId })
    setGoalTeamId(null)
  }

  const next = async () => { await createNextGame(currentGame.id) }
  const sameTeams = async () => {
    const drafts: TeamDraft[] = setTeams.map(team => ({
      name: team.name, color: team.color,
      playerIds: data.memberships.filter(m => m.teamId === team.id).map(m => m.playerId),
    }))
    await createSet(sessionId, drafts)
  }
  const finish = async () => { await completeSession(sessionId); onFinish() }

  return <section className="live-screen">
    <header className="live-topbar"><button onClick={onBack}>⌄</button><div><span>MÁNUDAGSBOLTINN</span><strong>{new Date(`${session.playedOn}T12:00:00`).toLocaleDateString('is-IS', { day:'numeric', month:'short' })}</strong></div><div className="live-set-pill">SETT {currentSet.setNo}</div></header>
    <SetScoreboard set={currentSet} teams={setTeams} games={setGames} winsPerPoint={session.winsPerPoint} pointsToWinSet={session.pointsToWinSet}/>

    {currentSet.status !== 'completed' ? <main className="match-stage">
      <div className="game-label">LEIKUR {currentGame.gameNo}</div>
      <div className={`timer ${remaining <= 10 && currentGame.status === 'live' ? 'danger' : ''}`}>{formatClock(remaining)}</div>
      <div className="match-status">{currentGame.status === 'ready' ? 'Tilbúið' : currentGame.status === 'live' ? 'Í gangi' : currentGame.status === 'paused' ? 'Pása' : currentGame.endReason === 'goal' ? 'MARK' : 'Tími'}</div>
      <div className="versus-grid">
        <button className="goal-team-button" style={{ '--team-color': holder.color } as React.CSSProperties} disabled={currentGame.status !== 'live'} onClick={() => setGoalTeamId(holder.id)}><span className="role">INNI</span><strong>{holder.name}</strong><b>⚽ MARK</b></button>
        <div className="vs">VS</div>
        <button className="goal-team-button" style={{ '--team-color': challenger.color } as React.CSSProperties} disabled={currentGame.status !== 'live'} onClick={() => setGoalTeamId(challenger.id)}><span className="role">ÁSKORANDI</span><strong>{challenger.name}</strong><b>⚽ MARK</b></button>
      </div>
      {waiting && <div className="waiting-team"><span className="team-dot" style={{ background: waiting.color }}/><span>Bíður:</span><strong>{waiting.name}</strong></div>}
      <div className="match-controls">
        {currentGame.status === 'ready' && <button className="primary jumbo" onClick={() => void startGame(currentGame.id)}>STARTA LEIK</button>}
        {currentGame.status === 'live' && <><button className="control-big" onClick={() => void pauseGame(currentGame.id)}>Ⅱ PÁSA</button><button className="control-small" onClick={() => { playBuzzer(); void timeoutGame(currentGame.id) }}>⏱ TÍMI</button></>}
        {currentGame.status === 'paused' && <><button className="primary control-big" onClick={() => void resumeGame(currentGame.id)}>▶ HALDA ÁFRAM</button><button className="control-small" onClick={() => { playBuzzer(); void timeoutGame(currentGame.id) }}>⏱ TÍMI</button></>}
      </div>
      {currentGame.status === 'completed' && <div className="game-result card">
        {currentGame.endReason === 'goal' ? <><div className="result-icon">⚽</div><div><span>Litli sigurinn</span><h2>{setTeams.find(t => t.id === currentGame.winningTeamId)?.name}</h2>{activeGoal && <p>{players.find(p => p.id === activeGoal.scorerPlayerId)?.name}{activeGoal.assistPlayerId ? ` · 🅰 ${players.find(p => p.id === activeGoal.assistPlayerId)?.name}` : ''}</p>}</div></> : <><div className="result-icon">⏱</div><div><span>Tíminn rann út</span><h2>{setTeams.find(t => t.id === currentGame.exitingTeamId)?.name} fer út</h2></div></>}
        <div className="result-actions">{currentGame.endReason === 'goal' && <button onClick={() => void undoGoal(currentGame.id)}>↶ Leiðrétta mark</button>}<button className="primary" onClick={() => void next()}>NÆSTI LEIKUR →</button></div>
      </div>}
    </main> : <SetCompletePanel setNo={currentSet.setNo} setTeams={setTeams} setStats={setStats} players={players} memberships={data.memberships} goals={data.goals} games={setGames} onSame={() => void sameTeams()} onReshuffle={onReshuffle} onFinish={() => void finish()}/>} 

    <section className="live-session-stats"><div className="subheading"><span>KVÖLDIÐ</span><strong>Staða leikmanna</strong></div><div className="compact-table"><div className="table-head"><span>Leikmaður</span><span>Stig</span><span>⚽</span><span>🅰</span></div>{allStats.slice(0, 8).map(stat => <div className="table-row" key={stat.playerId}><span>{players.find(p => p.id === stat.playerId)?.name}</span><strong>{stat.points}</strong><span>{stat.goals}</span><span>{stat.assists}</span></div>)}</div></section>
    {goalTeam && <GoalModal team={goalTeam} players={membersForGoalTeam} onClose={() => setGoalTeamId(null)} onSave={saveGoal}/>} 
  </section>
}

function SetCompletePanel({ setNo, setTeams, setStats, players, memberships, goals, games, onSame, onReshuffle, onFinish }: any) {
  const winnerStat = setStats.find((s: any) => s.isWinner)
  const winner = setTeams.find((t: any) => t.id === winnerStat?.teamId)
  const setGoalIds = new Set(games.map((g: any) => g.id))
  const goalStats = players.map((player: any) => ({
    player,
    goals: goals.filter((g: any) => setGoalIds.has(g.gameId) && !g.deletedAt && g.scorerPlayerId === player.id).length,
    assists: goals.filter((g: any) => setGoalIds.has(g.gameId) && !g.deletedAt && g.assistPlayerId === player.id).length,
  })).filter((x: any) => x.goals || x.assists).sort((a: any,b: any) => b.goals - a.goals || b.assists - a.assists)
  return <main className="set-complete">
    <div className="trophy">🏆</div><span className="eyebrow">SETT {setNo} KLÁRAÐ</span><h1>{winner?.name} vinnur</h1>
    <div className="final-team-scores">{setStats.sort((a:any,b:any)=>b.points-a.points).map((stat:any) => { const team=setTeams.find((t:any)=>t.id===stat.teamId); return <div key={stat.teamId} className={stat.isWinner?'winner':''}><span className="team-dot" style={{background:team.color}}/><strong>{team.name}</strong><b>{stat.points} stig</b>{stat.isChoke && <em>😵 CHOKE</em>}{stat.isZeroPointSet && <em>🥚 0-SETT</em>}</div>})}</div>
    {goalStats.length > 0 && <div className="set-player-stats card"><h3>Í settinu</h3>{goalStats.map((row:any)=><div key={row.player.id}><span>{row.player.name}</span><span>⚽ {row.goals}</span><span>🅰 {row.assists}</span></div>)}</div>}
    <div className="next-set-actions"><button className="primary jumbo" onClick={onSame}>Næsta sett · sömu lið</button><button onClick={onReshuffle}>⤨ Skipta upp liðum</button><button className="danger-text" onClick={onFinish}>Klára kvöldið</button></div>
  </main>
}
