import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '../components/Modal'
import { RoleBadge } from '../components/RoleBadge'
import { SyncIndicator } from '../components/SyncIndicator'
import { useApp } from '../context/AppContext'
import { closeSession, completeGoal, completeTimeout, freezeForGoal, pauseGame, resumeGame, startGame } from '../domain/gameEngine'
import { playerSessionStats, teamSessionStats } from '../domain/stats'
import type { Session, TeamCode } from '../domain/types'
import { playBuzzer, unlockAudio } from '../lib/sound'
import { releaseWakeLock, requestWakeLock } from '../lib/wakelock'

function time(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

type PendingGoal = { team: TeamCode; scorerId: string | null; ownGoal: boolean; at: number }

export function LiveScreen({ session, onSummary, onFinished }: {
  session: Session
  onSummary: (session: Session) => void
  onFinished: (session: Session) => void
}) {
  const { state, updateSession, undoSession, finishSession } = useApp()
  const [now, setNow] = useState(Date.now())
  const [pendingGoal, setPendingGoal] = useState<PendingGoal | null>(null)
  const [timeoutChoice, setTimeoutChoice] = useState(false)
  const [setWinner, setSetWinner] = useState<TeamCode | null>(null)
  const [showLiveSummary, setShowLiveSummary] = useState(false)
  const expiryFor = useRef<string | null>(null)

  useEffect(() => { requestWakeLock(); return () => { releaseWakeLock() } }, [])
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') requestWakeLock() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])
  useEffect(() => {
    if (session.activeGame.status !== 'RUNNING') return
    const id = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(id)
  }, [session.activeGame.status, session.activeGame.id])

  const remaining = useMemo(() => {
    const g = session.activeGame
    return g.status === 'RUNNING' && g.deadlineAt ? Math.max(0, g.deadlineAt - now) : g.remainingMs
  }, [session.activeGame, now])

  useEffect(() => {
    const g = session.activeGame
    if (g.status !== 'RUNNING' || remaining > 0 || expiryFor.current === g.id) return
    expiryFor.current = g.id
    playBuzzer().catch(() => undefined)
    if (g.waitingTeam && !g.incumbentTeam) {
      updateSession(session.id, (s) => ({
        ...s,
        activeGame: { ...s.activeGame, status: 'PAUSED', remainingMs: 0, deadlineAt: null },
        updatedAt: Date.now(),
      })).then(() => setTimeoutChoice(true))
      return
    }
    updateSession(session.id, (s) => completeTimeout(s, undefined, Date.now()), true)
  }, [remaining, session.activeGame.id, session.activeGame.status])

  const tStats = teamSessionStats(session)
  const pStats = playerSessionStats(state, session)
  const game = session.activeGame
  const teamPlayers = (code: TeamCode) => session.players.filter((p) => p.present && p.teamCode === code).map((sp) => ({
    ...sp, player: state.players.find((p) => p.id === sp.playerId)!,
  }))
  const opponent = (team: TeamCode) => game.team1 === team ? game.team2 : game.team1

  async function begin() {
    await unlockAudio().catch(() => undefined)
    await requestWakeLock()
    expiryFor.current = null
    await updateSession(session.id, (s) => startGame(s))
  }

  async function togglePause() {
    if (game.status === 'RUNNING') await updateSession(session.id, (s) => pauseGame(s))
    else if (game.status === 'PAUSED') await updateSession(session.id, (s) => resumeGame(s))
  }

  async function beginGoal(team: TeamCode) {
    if (!['RUNNING', 'PAUSED'].includes(game.status)) return
    const at = Date.now()
    if (game.status === 'RUNNING') await updateSession(session.id, (s) => freezeForGoal(s, at))
    setPendingGoal({ team, scorerId: null, ownGoal: false, at })
  }

  async function finishGoal(assistId: string | null) {
    if (!pendingGoal?.scorerId) return
    const winner = session.setWins[pendingGoal.team] === session.winsRequired - 1 ? pendingGoal.team : null
    await updateSession(session.id, (s) => completeGoal(s, pendingGoal.team, pendingGoal.scorerId!, assistId, pendingGoal.ownGoal, pendingGoal.at).session, true)
    setPendingGoal(null)
    expiryFor.current = null
    if (winner) setSetWinner(winner)
  }

  async function finishOwnGoal(scorerId: string) {
    if (!pendingGoal) return
    const winner = session.setWins[pendingGoal.team] === session.winsRequired - 1 ? pendingGoal.team : null
    await updateSession(session.id, (s) => completeGoal(s, pendingGoal.team, scorerId, null, true, pendingGoal.at).session, true)
    setPendingGoal(null)
    expiryFor.current = null
    if (winner) setSetWinner(winner)
  }

  async function timeoutOutgoing(team: TeamCode) {
    await updateSession(session.id, (s) => completeTimeout(s, team, Date.now()), true)
    setTimeoutChoice(false)
    expiryFor.current = null
  }

  async function endNight() {
    if (!window.confirm('Klára boltakvöldið? Þú getur skoðað samantektina eftir á.')) return
    const closed = closeSession(session)
    finishSession(closed)
    await releaseWakeLock()
    onFinished(closed)
  }

  return <main className="live-page">
    <header className="live-topbar">
      <div><span className="eyebrow">SETT #{session.setNumber}</span><strong>{session.sessionDate}</strong></div>
      <SyncIndicator />
    </header>

    <div className={`score-grid teams-${session.teamCount}`}>
      {session.teams.map((team) => <div key={team.code} className={`score-card ${game.team1 === team.code || game.team2 === team.code ? 'active' : ''}`}>
        <span className="team-label">Lið {team.code}</span>
        <strong>{session.setWins[team.code]}</strong>
        <span className="session-sets">{session.sessionSets[team.code]} sett</span>
      </div>)}
    </div>

    <section className="live-card">
      <div className="matchup"><span className="team-badge">{game.team1}</span><span>VS</span><span className="team-badge">{game.team2}</span></div>
      <div className={`timer ${remaining <= 10_000 && game.status === 'RUNNING' ? 'urgent' : ''}`}>{time(remaining)}</div>
      <div className="status-line">
        {game.status === 'READY' && 'Tilbúið – tíminn byrjar ekki fyrr en ýtt er á Start'}
        {game.status === 'PAUSED' && '⏸ PÁSAÐ'}
        {game.status === 'RUNNING' && game.incumbentTeam && `Lið ${game.incumbentTeam} hefur verið lengur inni`}
        {game.status === 'RUNNING' && !game.incumbentTeam && 'Fyrsti leikur / ekkert lið lengur inni'}
      </div>

      {game.status === 'READY' ? <button className="primary huge start-button" onClick={begin}>▶ BYRJA LEIK</button> : <>
        <div className="goal-row"><button className="goal-button" onClick={() => beginGoal(game.team1)}>⚽ LIÐ {game.team1}</button><button className="goal-button" onClick={() => beginGoal(game.team2)}>⚽ LIÐ {game.team2}</button></div>
        <button className="pause-button" onClick={togglePause}>{game.status === 'PAUSED' ? '▶ HALDA ÁFRAM' : '⏸ PÁSA'}</button>
      </>}

      <p className="rotation-line">{game.waitingTeam ? `Lið ${game.waitingTeam} bíður` : '2 lið · engin rotation'}</p>
    </section>

    <div className={`team-list teams-${session.teamCount}`}>
      {session.teams.map((team) => <div key={team.code}><h3>Lið {team.code}</h3>{teamPlayers(team.code).map(({ player, roleAtSession }) => <div className="player-chip" key={player.id}><span>{player.name}</span><RoleBadge role={roleAtSession}/></div>)}</div>)}
    </div>

    <div className="live-actions">
      <button className="secondary" onClick={() => setShowLiveSummary(true)}>▥ Staða kvöldsins</button>
      <button className="ghost" onClick={async () => { if (!(await undoSession(session.id))) alert('Ekkert atvik til að afturkalla.') }}>↩ Undo</button>
      <button className="danger-ghost" onClick={endNight}>Klára kvöld</button>
    </div>

    {pendingGoal && !pendingGoal.scorerId && <Modal>
      <p className="eyebrow">MARK · LIÐ {pendingGoal.team}</p><h2>Hver skoraði?</h2>
      <div className="player-buttons">{teamPlayers(pendingGoal.team).map(({ player, roleAtSession }) => <button key={player.id} onClick={() => setPendingGoal((g) => g ? { ...g, scorerId: player.id, ownGoal: false } : g)}>{player.name} <RoleBadge role={roleAtSession}/></button>)}</div>
      <button className="secondary full" onClick={() => setPendingGoal((g) => g ? { ...g, ownGoal: true } : g)}>Sjálfsmark</button>
      {pendingGoal.ownGoal && <div className="player-buttons sub-panel">{teamPlayers(opponent(pendingGoal.team)).map(({ player }) => <button key={player.id} onClick={() => finishOwnGoal(player.id)}>{player.name}</button>)}</div>}
      <button className="ghost full" onClick={() => setPendingGoal(null)}>Hætta við · leikur helst paus-aður</button>
    </Modal>}

    {pendingGoal?.scorerId && !pendingGoal.ownGoal && <Modal>
      <p className="eyebrow">MARK · LIÐ {pendingGoal.team}</p><h2>Stoðsending?</h2>
      <div className="player-buttons">{teamPlayers(pendingGoal.team).filter(({ player }) => player.id !== pendingGoal.scorerId).map(({ player, roleAtSession }) => <button key={player.id} onClick={() => finishGoal(player.id)}>{player.name} <RoleBadge role={roleAtSession}/></button>)}</div>
      <button className="secondary full" onClick={() => finishGoal(null)}>Engin stoðsending</button>
    </Modal>}

    {timeoutChoice && <Modal>
      <p className="eyebrow">TÍMI</p><h2>Hvort liðið fer út?</h2><p className="muted">Kerfið veit ekki incumbent í fyrsta leiknum.</p>
      <div className="goal-row"><button className="secondary huge" onClick={() => timeoutOutgoing(game.team1)}>Lið {game.team1} út</button><button className="secondary huge" onClick={() => timeoutOutgoing(game.team2)}>Lið {game.team2} út</button></div>
    </Modal>}

    {setWinner && <Modal className="winner-modal"><div className="trophy">🏆</div><p className="eyebrow">SETT LOKIÐ</p><h2>Lið {setWinner} vinnur settið</h2><p>Nýtt sett er tilbúið. Rotation heldur áfram en næsti 3 mín leikur byrjar handvirkt.</p><button className="primary huge" onClick={() => setSetWinner(null)}>Áfram</button></Modal>}

    {showLiveSummary && <Modal className="summary-modal"><SessionStatsBlock session={session} onClose={() => setShowLiveSummary(false)} /></Modal>}
  </main>
}

export function SessionStatsBlock({ session, onClose }: { session: Session; onClose?: () => void }) {
  const { state } = useApp()
  const teams = teamSessionStats(session)
  const players = playerSessionStats(state, session)
  return <>
    <p className="eyebrow">STAÐA KVÖLDSINS</p><h2>{session.sessionDate}</h2>
    <div className={`summary-team-grid teams-${session.teamCount}`}>{teams.map((t) => <div className="summary-team-card" key={t.teamCode}><div className="summary-team-title"><strong>Lið {t.teamCode}</strong><span>{t.players} leikmenn</span></div><div className="summary-metrics"><div><strong>{t.wins}</strong><span>Sigrar</span></div><div><strong>{t.sets}</strong><span>Sett</span></div><div><strong>{t.chokes}</strong><span>Choke</span></div><div><strong>{t.nix}</strong><span>Nix</span></div></div></div>)}</div>
    <h3 className="summary-subheading">Leikmenn</h3>
    <div className="stats-table-wrap"><table className="stats-table"><thead><tr><th>Leikmaður</th><th>Lið</th><th>Hlutverk</th><th>Leikir</th><th>Sigrar</th><th>Sett</th><th>Mörk</th><th>Assist</th><th>G+A</th><th>Win%</th><th>Choke</th><th>Nix</th></tr></thead><tbody>{players.map((p) => <tr key={p.playerId}><td>{p.playerName}</td><td>{p.teamCode}</td><td>{p.roleAtSession === 'REGULAR' ? 'Fastur' : 'Varam.'}</td><td>{p.miniGames}</td><td>{p.wins}</td><td>{p.sets}</td><td>{p.goals}</td><td>{p.assists}</td><td>{p.goalContributions}</td><td>{Math.round(p.winPct * 100)}%</td><td>{p.chokes}</td><td>{p.nix}</td></tr>)}</tbody></table></div>
    {onClose && <button className="primary full summary-close" onClick={onClose}>Loka</button>}
  </>
}
