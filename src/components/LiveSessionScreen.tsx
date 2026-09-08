import { DeleteNight } from './DeleteNight'
import { GameHistory } from './GameHistory'
import { AssistSetting } from './AssistSetting'
import { NightTeams } from './NightTeams'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/localDb'
import { completeSession, createNextGame, createSet, pauseGame, recordGoal, recoverRunningGames, resumeGame, startGame, timeoutGame, undoLastScoringAction, type TeamDraft } from '../data/repository'
import { buildSetTeamStats, currentRemainingSeconds, formatClock } from '../domain/rules'
import { NightSets } from './NightSets'
import { buildSessionSummary } from '../services/sessionSummary'
import { playBuzzer, unlockAudio } from '../lib/sound'
import { GoalModal } from './GoalModal'
import { SetScoreboard } from './SetScoreboard'
import { releaseWakeLock, requestWakeLock } from '../lib/wakelock'

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
    const hasUndo = await db.undoActions.where('sessionId').equals(sessionId).count() > 0
    return { session, attendance, sets, teams, memberships, games, goals, hasUndo, players: players as NonNullable<(typeof players)[number]>[] }
  }, [sessionId])

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [recovered, setRecovered] = useState(false)
  const actionLock = useRef(false)
  const [goalTeamId, setGoalTeamId] = useState<string | null>(null)
  const [choosingOutgoing, setChoosingOutgoing] = useState(false)
  const [tick, setTick] = useState(Date.now())
  const buzzerFor = useRef<string | null>(null)

  useEffect(() => {
    setRecovered(false)
    void recoverRunningGames(sessionId).then(() => setRecovered(true)).catch(() => setError('Endurheimt mistókst. Reyndu að opna kvöldið aftur.'))
    void requestWakeLock()
    const visible = () => { if (document.visibilityState === 'visible') void requestWakeLock() }
    document.addEventListener('visibilitychange', visible)
    return () => { document.removeEventListener('visibilitychange', visible); void releaseWakeLock() }
  }, [sessionId])

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
    if (!recovered || !currentGame || currentGame.status !== 'live' || remaining > 0 || buzzerFor.current === currentGame.id || goalTeamId || actionLock.current) return
    buzzerFor.current = currentGame.id
    void run(() => expireGame(currentGame))
  }, [currentGame, remaining, recovered, goalTeamId])

  if (!recovered || !data || !currentSet || !currentGame) return <div className="screen loading-screen">{error || 'Hleð leikdegi…'}{error && <button onClick={onBack}>Til baka</button>}</div>
  const { session, players } = data
  const holder = setTeams.find(t => t.id === currentGame.holderTeamId)!
  const challenger = setTeams.find(t => t.id === currentGame.challengerTeamId)!
  const waiting = setTeams.find(t => t.id === currentGame.waitingTeamId)
  const goalTeam = setTeams.find(t => t.id === goalTeamId)
  const membersForGoalTeam = goalTeam ? data.memberships.filter(m => m.teamId === goalTeam.id).map(m => players.find(p => p.id === m.playerId)).filter(Boolean) as typeof players : []
  const defendingTeamId = goalTeamId === currentGame.holderTeamId ? currentGame.challengerTeamId : currentGame.holderTeamId
  const defendingPlayers = goalTeam ? data.memberships.filter(m => m.teamId === defendingTeamId).map(m => players.find(p => p.id === m.playerId)).filter(Boolean) as typeof players : []
  const setStats = buildSetTeamStats(currentSet, setTeams, setGames, session)
  const summary = buildSessionSummary(data)
  const nightTeams = summary.teams
  const setWins = Object.fromEntries(setTeams.map(team => {
    const ids = data.memberships.filter(m => m.teamId === team.id).map(m => m.playerId).sort()
    const key = JSON.stringify([team.sortOrder, ids])
    return [team.id, nightTeams.find(t => t.key === key)?.sets ?? 0]
  }))

  const saveGoal = async (scorerId: string, assistId: string | null, eventType: 'GOAL' | 'OWN_GOAL') => {
    if (!goalTeam) return
    await recordGoal({ gameId: currentGame.id, teamId: goalTeam.id, scorerPlayerId: scorerId, assistPlayerId: assistId, eventType })
    setGoalTeamId(null)
  }

  const expireGame = async (game: typeof currentGame) => {
    if (game.waitingTeamId && !game.incumbentTeamId) {
      void playBuzzer().catch(() => undefined)
      await pauseGame(game.id)
      setChoosingOutgoing(true)
      return
    }
    void playBuzzer().catch(() => undefined)
    await timeoutGame(game.id)
  }

  const chooseOutgoing = async (teamId: string) => {
    await timeoutGame(currentGame.id, teamId)
    setChoosingOutgoing(false)
  }

  const next = async () => { await createNextGame(currentGame.id) }
  const sameTeams = async () => {
    const drafts: TeamDraft[] = setTeams.map(team => ({
      name: team.name, color: team.color,
      playerIds: data.memberships.filter(m => m.teamId === team.id).map(m => m.playerId),
    }))
    await createSet(sessionId, drafts)
  }
  const finish = async () => {
    await pauseGame(currentGame.id)
    if (!window.confirm('Klára kvöldið? Skráð mörk og leikir haldast. Ólokinn leikur telst ekki með og óunnið sett fær engan sigurvegara. Ef þú hættir við helst klukkan í pásu.')) return
    await completeSession(sessionId)
    await releaseWakeLock()
    onFinish()
  }
  async function run(action: () => Promise<unknown>) {
    if (actionLock.current) return
    actionLock.current = true; setBusy(true); setError('')
    try { await action(); setTick(Date.now()) }
    catch (error) { setError(error instanceof Error ? error.message : 'Aðgerðin mistókst. Reyndu aftur.'); buzzerFor.current = null }
    finally { actionLock.current = false; setBusy(false) }
  }
  const beginGoal = async (teamId: string) => {
    await pauseGame(currentGame.id)
    const paused = await db.games.get(currentGame.id)
    if (!paused || paused.remainingSeconds <= 0) { await expireGame(currentGame); return }
    setGoalTeamId(teamId)
  }
  const previousSet = data.sets.at(-2)
  const undoAvailable = data.hasUndo
  const begin = async () => { await unlockAudio().catch(() => undefined); await startGame(currentGame.id) }
  if (session.status === 'completed') return <section className="screen page-screen"><h1>Kvöldinu er lokið</h1><button className="primary jumbo" onClick={onFinish}>Skoða samantekt</button></section>

  return <section className="live-screen">
    <header className="live-topbar"><button onClick={onBack}>⌄</button><div><span>MÁNUDAGSBOLTINN</span><strong>{new Date(`${session.playedOn}T12:00:00`).toLocaleDateString('is-IS', { day:'numeric', month:'short' })}</strong></div><div className="live-set-pill">SETT {currentSet.setNo}</div></header>
    {error && <p className="warning-banner" role="alert">{error}</p>}
    {previousSet?.status === 'completed' && currentGame.gameNo === 1 && currentGame.status === 'ready' && <p className="set-win-notice">🏆 {data.teams.find(t => t.id === previousSet.winningTeamId)?.name} vann sett {previousSet.setNo}. Nýtt sett er tilbúið.</p>}
    <SetScoreboard set={currentSet} teams={setTeams} games={setGames} winsPerPoint={session.winsPerPoint} pointsToWinSet={session.pointsToWinSet} setWins={setWins} playerNames={Object.fromEntries(players.map(p=>[p.id,p.name]))}/>

    {currentSet.status !== 'completed' ? <main className="match-stage">
      <div className="game-label">LEIKUR {currentGame.gameNo}</div>
      <div className={`timer ${remaining <= 10 && currentGame.status === 'live' ? 'danger' : ''}`} role="timer" aria-live="off" aria-label={`${Math.ceil(remaining)} sekúndur eftir`}>{formatClock(remaining)}</div>
      <div className={`match-status status-${currentGame.status}`}>{currentGame.status === 'ready' ? 'Tilbúið' : currentGame.status === 'live' ? 'Í gangi' : currentGame.status === 'paused' ? 'Pása' : currentGame.endReason === 'goal' ? 'Mark' : 'Tími'}</div>
      <div className="versus-grid">
        <button className="goal-team-button" style={{ '--team-color': holder.color } as React.CSSProperties} disabled={busy || currentGame.status !== 'live' || remaining <= 0} onClick={() => void run(() => beginGoal(holder.id))}><span className="role">INNI</span><strong>{holder.name}</strong><b>⚽ MARK</b></button>
        <div className="vs">VS</div>
        <button className="goal-team-button" style={{ '--team-color': challenger.color } as React.CSSProperties} disabled={busy || currentGame.status !== 'live' || remaining <= 0} onClick={() => void run(() => beginGoal(challenger.id))}><span className="role">ÁSKORANDI</span><strong>{challenger.name}</strong><b>⚽ MARK</b></button>
      </div>
      {waiting && <p className="setup-hint">{currentGame.incumbentTeamId ? `${setTeams.find(t => t.id === currentGame.incumbentTeamId)?.name} hefur verið lengur inni` : 'Fyrsti tími: velja þarf liðið sem fer út'}</p>}
      {waiting && <div className="waiting-team"><span className="team-dot" style={{ background: waiting.color }}/><span>Bíður:</span><strong>{waiting.name}</strong></div>}
      <div className="match-controls">
        {currentGame.status === 'ready' && <><button className="primary jumbo" disabled={busy} onClick={() => void run(begin)}>STARTA LEIK</button><button className="control-small" onClick={() => void playBuzzer().catch(() => undefined)}>Prófa lokahljóð</button></>}
        {currentGame.status === 'live' && <><button className="control-big" disabled={busy} onClick={() => void run(() => pauseGame(currentGame.id))}>Ⅱ PÁSA</button><button className="control-small" disabled={busy || remaining > 0} onClick={() => void run(() => expireGame(currentGame))}>⏱ TÍMI</button></>}
        {currentGame.status === 'paused' && <><button className="primary control-big" disabled={busy || remaining <= 0} onClick={() => void run(() => resumeGame(currentGame.id))}>▶ HALDA ÁFRAM</button><button className="control-small" disabled={busy || remaining > 0} onClick={() => void run(() => expireGame(currentGame))}>⏱ TÍMI</button></>}
      </div>
      {currentGame.status === 'completed' && <div className="game-result card">
        {currentGame.endReason === 'goal' ? <><div className="result-icon">⚽</div><div><span>Litli sigurinn</span><h2>{setTeams.find(t => t.id === currentGame.winningTeamId)?.name}</h2>{activeGoal && <p>{players.find(p => p.id === activeGoal.scorerPlayerId)?.name}{activeGoal.assistPlayerId ? ` · 🅰 ${players.find(p => p.id === activeGoal.assistPlayerId)?.name}` : ''}</p>}</div></> : <><div className="result-icon">⏱</div><div><span>Tíminn rann út</span><h2>{setTeams.find(t => t.id === currentGame.exitingTeamId)?.name} fer út</h2></div></>}
        <div className="result-actions">{currentGame.endReason === 'goal' && <button disabled={busy} onClick={() => void run(() => undoLastScoringAction(sessionId))}>↶ Leiðrétta mark</button>}<button className="primary" disabled={busy} onClick={() => void run(next)}>NÆSTI LEIKUR →</button></div>
      </div>}
    </main> : <SetCompletePanel
      setNo={currentSet.setNo} setTeams={setTeams} setStats={setStats} players={players}
      memberships={data.memberships} goals={data.goals} games={setGames}
      onUndo={() => void undoLastScoringAction(sessionId)} onSame={() => void sameTeams()}
      onReshuffle={onReshuffle} onFinish={() => void run(finish)}
    />}

    <div className="night-actions">
      <button disabled={busy || !undoAvailable} onClick={() => void run(() => undoLastScoringAction(sessionId))}>↶ Afturkalla síðasta leik</button>
      <button disabled={busy} onClick={() => void run(finish)}>Klára kvöldið</button>
    </div>
    <GameHistory sessionId={sessionId}/>
    <AssistSetting sessionId={sessionId} enabled={session.assistsEnabled !== false}/>
    <DeleteNight sessionId={sessionId} onDeleted={onBack}/>
    <section className="live-session-stats">
    <NightSets data={data}/>
    {summary.assistsIncomplete && <p className="data-quality-note">Stoðsendingar eru ekki skráðar í öllum leikjum. Tölurnar sýna aðeins skráðar stoðsendingar.</p>}
    <h2>Lið kvöldsins</h2><NightTeams teams={nightTeams}/><p>{summary.draws} jafntefli alls í kvöld.</p>
    <h2>Staða allra leikmanna</h2><div className="summary-table-wrap"><table className="summary-table"><thead><tr><th>Leikmaður</th><th>Sett</th><th>Sigrar</th><th>Jafntefli</th><th>Mörk</th><th>Stoðs.</th></tr></thead><tbody>{summary.players.map(p => <tr key={p.playerId}><th scope="row">{p.name}</th><td>{p.setWins}</td><td>{p.smallWins}</td><td>{p.draws}</td><td>{p.goals}</td><td>{p.assists}</td></tr>)}</tbody></table></div></section>
    {goalTeam && <GoalModal
      team={goalTeam} players={membersForGoalTeam} defendingPlayers={defendingPlayers}
      assistsEnabled={session.assistsEnabled !== false}
      onClose={() => setGoalTeamId(null)} onSave={saveGoal}
    />}
    {choosingOutgoing && <TimeoutChoiceModal holder={holder} challenger={challenger} onChoose={teamId => void run(() => chooseOutgoing(teamId))} />}
  </section>
}

function TimeoutChoiceModal({ holder, challenger, onChoose }: { holder: { id: string; name: string; color: string }; challenger: { id: string; name: string; color: string }; onChoose: (teamId: string) => void }) {
  return <div className="modal-backdrop timeout-backdrop" role="dialog" aria-modal="true" aria-labelledby="timeout-title">
    <section className="timeout-choice-sheet">
      <div className="modal-grabber" />
      <span className="eyebrow">TÍMINN RANN ÚT</span>
      <h2 id="timeout-title">Hvort liðið fer út?</h2>
      <p>Fyrsti leikurinn segir okkur ekki hvort liðið hefur verið lengur inni. Veldu liðið sem yfirgefur völlinn.</p>
      <div className="timeout-team-choices">
        {[holder, challenger].map(team => <button key={team.id} style={{ '--team-color': team.color } as React.CSSProperties} onClick={() => onChoose(team.id)}>
          <span className="team-dot" /><strong>{team.name}</strong><small>FER ÚT</small>
        </button>)}
      </div>
    </section>
  </div>
}

function SetCompletePanel({ setNo, setTeams, setStats, players, memberships, goals, games, onUndo, onSame, onReshuffle, onFinish }: any) {
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
    <div className="final-team-scores">{setStats.sort((a:any,b:any)=>b.points-a.points).map((stat:any) => { const team=setTeams.find((t:any)=>t.id===stat.teamId); return <div key={stat.teamId} className={stat.isWinner?'winner':''}><span className="team-dot" style={{background:team.color}}/><strong>{team.name}</strong><b>{stat.smallWins} sigrar</b>{stat.isChoke && <em>😵 CHOKE</em>}{stat.isZeroPointSet && <em>🥚 0-SETT</em>}</div>})}</div>
    {goalStats.length > 0 && <div className="set-player-stats card"><h3>Í settinu</h3>{goalStats.map((row:any)=><div key={row.player.id}><span>{row.player.name}</span><span>⚽ {row.goals}</span><span>🅰 {row.assists}</span></div>)}</div>}
    <div className="next-set-actions"><button onClick={onUndo}>↶ Leiðrétta síðasta mark</button><button className="primary jumbo" onClick={onSame}>Næsta sett · sömu lið</button><button onClick={onReshuffle}>⤨ Skipta upp liðum</button><button className="danger-text" onClick={onFinish}>Klára kvöldið</button></div>
  </main>
}
