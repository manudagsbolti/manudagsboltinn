import { useEffect, useMemo, useRef, useState } from 'react'
import { clearState, clearUndoState, loadState, loadUndoState, saveState, saveUndoState } from './lib/db'
import {
  completeGoal,
  completeTimeout,
  freezeGameForGoal,
  pauseGame,
  recoverRunningGameAsPaused,
  resumeGame,
  startGame,
} from './lib/gameEngine'
import { playBuzzer, unlockAudio } from './lib/sound'
import { releaseWakeLock, requestWakeLock } from './lib/wakelock'
import { createMockSession } from './mock'
import type { Player, SessionState, TeamCode } from './types'
import './styles.css'

type PendingGoal = {
  team: TeamCode
  at: number
  scorerId: string | null
  ownGoal: boolean
}


function formatTime(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function App() {
  const [state, setState] = useState<SessionState | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [pendingGoal, setPendingGoal] = useState<PendingGoal | null>(null)
  const [timeoutNeedsChoice, setTimeoutNeedsChoice] = useState(false)
  const [raceWinner, setRaceWinner] = useState<TeamCode | null>(null)
  const [undoAvailable, setUndoAvailable] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [showSummary, setShowSummary] = useState(false)
  const expiryHandledFor = useRef<string | null>(null)

  useEffect(() => {
    Promise.all([loadState<SessionState>(), loadUndoState<SessionState>()]).then(([saved, undo]) => {
      if (saved) {
        const recovered = recoverRunningGameAsPaused(saved)
        setState(recovered)
        if (recovered !== saved) saveState(recovered)
      }
      setUndoAvailable(Boolean(undo))
      setHydrated(true)
    })
  }, [])

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  useEffect(() => {
    if (!state) return
    saveState(state)
  }, [state])

  useEffect(() => {
    if (!state || state.activeGame.status !== 'RUNNING') return
    const timer = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(timer)
  }, [state?.activeGame.status, state?.activeGame.id])

  const displayedRemaining = useMemo(() => {
    if (!state) return 180_000
    const g = state.activeGame
    if (g.status === 'RUNNING' && g.deadlineAt) return Math.max(0, g.deadlineAt - now)
    return g.remainingMs
  }, [state, now])

  useEffect(() => {
    if (!state) return
    const g = state.activeGame
    if (g.status !== 'RUNNING' || displayedRemaining > 0) return
    if (expiryHandledFor.current === g.id) return
    expiryHandledFor.current = g.id

    playBuzzer().catch(() => undefined)
    if (!g.waitingTeam) {
      commitWithUndo((current) => completeTimeout(current, undefined, Date.now()))
    } else if (g.incumbentTeam) {
      commitWithUndo((current) => completeTimeout(current, undefined, Date.now()))
    } else {
      setState((current) => (current ? pauseGame(current, Date.now()) : current))
      setTimeoutNeedsChoice(true)
    }
  }, [displayedRemaining, state?.activeGame.id, state?.activeGame.status])

  useEffect(() => {
    const regain = () => {
      if (document.visibilityState === 'visible' && state) requestWakeLock()
    }
    document.addEventListener('visibilitychange', regain)
    return () => document.removeEventListener('visibilitychange', regain)
  }, [state])

  async function commitWithUndo(updater: (current: SessionState) => SessionState) {
    if (!state) return
    const previous = structuredClone(state)
    const next = updater(state)
    await saveUndoState(previous)
    setUndoAvailable(true)
    setState(next)
  }

  async function newMockSession(mode: 'THREE_UNEVEN' | 'TWO' = 'THREE_UNEVEN') {
    const fresh = createMockSession(mode)
    await clearUndoState()
    setUndoAvailable(false)
    setPendingGoal(null)
    setTimeoutNeedsChoice(false)
    setRaceWinner(null)
    setShowSummary(false)
    expiryHandledFor.current = null
    setState(fresh)
    await saveState(fresh)
    await unlockAudio().catch(() => undefined)
    await requestWakeLock()
  }

  async function resetAll() {
    await clearState()
    await clearUndoState()
    await releaseWakeLock()
    setState(null)
    setUndoAvailable(false)
    setPendingGoal(null)
    setTimeoutNeedsChoice(false)
    setRaceWinner(null)
    setShowSummary(false)
  }

  async function doUndo() {
    const previous = await loadUndoState<SessionState>()
    if (!previous) return
    setState(previous)
    await saveState(previous)
    await clearUndoState()
    setUndoAvailable(false)
    setPendingGoal(null)
    setTimeoutNeedsChoice(false)
    setRaceWinner(null)
    expiryHandledFor.current = null
  }

  async function beginGame() {
    if (!state) return
    await unlockAudio().catch(() => undefined)
    await requestWakeLock()
    expiryHandledFor.current = null
    setState(startGame(state))
  }

  function togglePause() {
    if (!state) return
    if (state.activeGame.status === 'RUNNING') setState(pauseGame(state))
    else if (state.activeGame.status === 'PAUSED') setState(resumeGame(state))
  }

  function clickGoal(team: TeamCode) {
    if (!state || !['RUNNING', 'PAUSED'].includes(state.activeGame.status)) return
    const at = Date.now()
    if (state.activeGame.status === 'RUNNING') setState(freezeGameForGoal(state, at))
    setPendingGoal({ team, at, scorerId: null, ownGoal: false })
  }

  function scoringPlayers(team: TeamCode): Player[] {
    return state?.teams.find((t) => t.id === team)?.players ?? []
  }

  function opponentPlayers(goalTeam: TeamCode): Player[] {
    if (!state) return []
    const g = state.activeGame
    const opponent = g.team1 === goalTeam ? g.team2 : g.team1
    return scoringPlayers(opponent)
  }

  async function chooseAssist(assistId: string | null) {
    if (!state || !pendingGoal?.scorerId) return
    const before = state.raceWins[pendingGoal.team]
    const willWinRace = before === 3
    await commitWithUndo((current) =>
      completeGoal(
        current,
        pendingGoal.team,
        pendingGoal.scorerId!,
        assistId,
        pendingGoal.ownGoal,
        pendingGoal.at,
      ),
    )
    if (willWinRace) setRaceWinner(pendingGoal.team)
    setPendingGoal(null)
    expiryHandledFor.current = null
  }

  async function chooseOwnGoalScorer(playerId: string) {
    if (!state || !pendingGoal) return
    const before = state.raceWins[pendingGoal.team]
    const willWinRace = before === 3
    await commitWithUndo((current) =>
      completeGoal(current, pendingGoal.team, playerId, null, true, pendingGoal.at),
    )
    if (willWinRace) setRaceWinner(pendingGoal.team)
    setPendingGoal(null)
    expiryHandledFor.current = null
  }

  async function chooseTimeoutOutgoing(team: TeamCode) {
    if (!state) return
    await commitWithUndo((current) => completeTimeout(current, team, Date.now()))
    setTimeoutNeedsChoice(false)
    expiryHandledFor.current = null
  }

  async function installApp() {
    if (!installPrompt) return
    await installPrompt.prompt()
    setInstallPrompt(null)
  }

  if (!hydrated) return <main className="splash">Hleð Mánudagsboltanum…</main>

  if (!state) {
    return (
      <main className="start-screen">
        <div className="brand-mark">MB</div>
        <p className="eyebrow">V1 · OFFLINE-FIRST</p>
        <h1>Mánudagsboltinn</h1>
        <p className="lede">Fyrsti vertical slice: timer, pause, mark + assist, rotation og sett upp í fjóra sigra.</p>
        <button className="primary huge" onClick={() => newMockSession('THREE_UNEVEN')}>Byrja 3-liða prufu · 4v4v5</button>
        <button className="secondary huge" onClick={() => newMockSession('TWO')}>Byrja 2-liða prufu · 4v4</button>
        <button className="secondary" onClick={() => playBuzzer()}>🔊 Prófa lokahljóð</button>
        {installPrompt && <button className="ghost" onClick={installApp}>Setja app á heimaskjá</button>}
      </main>
    )
  }

  const g = state.activeGame
  const activeTeams = [g.team1, g.team2]
  const isReady = g.status === 'READY'
  const isPaused = g.status === 'PAUSED'
  const visibleTeams = state.teams.map((team) => team.id)

  const teamSummary = state.teams.map((team) => {
    const games = state.miniGames.filter((game) => game.team1 === team.id || game.team2 === team.id).length
    const wins = state.miniGames.filter((game) => game.winnerTeam === team.id).length
    const goals = state.goals.filter((goal) => goal.team === team.id).length
    return {
      team: team.id,
      players: team.players.length,
      games,
      wins,
      sets: state.sessionPoints[team.id],
      goals,
    }
  })

  const playerSummary = state.teams.flatMap((team) =>
    team.players.map((player) => {
      const games = state.miniGames.filter((game) => game.team1 === team.id || game.team2 === team.id).length
      const wins = state.miniGames.filter((game) => game.winnerTeam === team.id).length
      const goals = state.goals.filter((goal) => goal.type === 'GOAL' && goal.scorerId === player.id).length
      const assists = state.goals.filter((goal) => goal.assistId === player.id).length
      const ownGoals = state.goals.filter((goal) => goal.type === 'OWN_GOAL' && goal.scorerId === player.id).length
      return {
        player,
        team: team.id,
        games,
        wins,
        sets: state.sessionPoints[team.id],
        goals,
        assists,
        goalContributions: goals + assists,
        ownGoals,
      }
    }),
  )

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">PRUFUKVÖLD · {state.sessionDate}</p>
          <h1>Sett {state.raceNumber}</h1>
        </div>
        <div className="sync-pill">● Local ✓</div>
      </header>

      <section className={`score-grid teams-${visibleTeams.length}`} aria-label="Staða setts">
        {visibleTeams.map((team) => (
          <div className={`score-card ${activeTeams.includes(team) ? 'active' : ''}`} key={team}>
            <span className="team-label">{team}</span>
            <strong>{state.raceWins[team]}</strong>
            <small>Sigrar í setti</small>
            <span className="session-sets">Sett kvölds: {state.sessionPoints[team]}</span>
          </div>
        ))}
      </section>

      <section className="live-card">
        <div className="matchup">
          <span className="team-badge">{g.team1}</span>
          <span>vs</span>
          <span className="team-badge">{g.team2}</span>
        </div>
        <div className={`timer ${displayedRemaining <= 10_000 && g.status === 'RUNNING' ? 'urgent' : ''}`}>
          {formatTime(displayedRemaining)}
        </div>
        <div className="status-line">
          {isReady && 'Tilbúið — tíminn byrjar aðeins þegar ýtt er á Start'}
          {g.status === 'RUNNING' && (g.incumbentTeam ? `${g.incumbentTeam} hefur verið lengur inni` : 'Fyrsti leikur — ekkert incumbent lið')}
          {isPaused && 'PÁSAÐ'}
        </div>

        {isReady ? (
          <button className="primary huge start-button" onClick={beginGame}>▶ BYRJA LEIK</button>
        ) : (
          <>
            <div className="goal-row">
              <button className="goal-button" onClick={() => clickGoal(g.team1)}>⚽ {g.team1}</button>
              <button className="goal-button" onClick={() => clickGoal(g.team2)}>⚽ {g.team2}</button>
            </div>
            <button className="pause-button" onClick={togglePause}>
              {isPaused ? '▶ HALDA ÁFRAM' : '⏸ PÁSA'}
            </button>
          </>
        )}

        <div className="rotation-line">
          {g.waitingTeam ? `${g.waitingTeam} bíður` : 'Tvö lið — ekkert lið bíður'}
        </div>
      </section>

      <section className={`team-list teams-${visibleTeams.length}`}>
        {state.teams.map((team) => (
          <div key={team.id}>
            <h3>Lið {team.id}</h3>
            {team.players.map((p) => (
              <span className="player-chip" key={p.id}>
                <span>{p.name}</span>
                {p.roleAtSession === 'SUBSTITUTE' && <small className="role-badge">V</small>}
              </span>
            ))}
          </div>
        ))}
      </section>

      <footer className="action-footer">
        <button className="ghost" onClick={() => setShowSummary(true)}>📊 Staða kvöldsins</button>
        <button className="ghost" disabled={!undoAvailable} onClick={doUndo}>↩ Undo síðasta atvik</button>
        <button className="ghost" onClick={resetAll}>Endurstilla prufu</button>
      </footer>


      {showSummary && (
        <div className="modal-backdrop">
          <div className="modal summary-modal">
            <p className="eyebrow">KVÖLDSYFIRLIT</p>
            <h2>Staða kvöldsins</h2>

            <div className="summary-team-grid">
              {teamSummary.map((summary) => (
                <div className="summary-team-card" key={summary.team}>
                  <div className="summary-team-title">
                    <strong>Lið {summary.team}</strong>
                    <span>{summary.players} leikmenn</span>
                  </div>
                  <div className="summary-metrics">
                    <div><strong>{summary.wins}</strong><span>Sigrar</span></div>
                    <div><strong>{summary.sets}</strong><span>Sett</span></div>
                    <div><strong>{summary.goals}</strong><span>Mörk</span></div>
                    <div><strong>{summary.games}</strong><span>Leikir</span></div>
                  </div>
                </div>
              ))}
            </div>

            <h3 className="summary-subheading">Leikmenn</h3>
            <div className="stats-table-wrap">
              <table className="stats-table">
                <thead>
                  <tr>
                    <th>Leikmaður</th>
                    <th>Lið</th>
                    <th>Hlutverk</th>
                    <th>Leikir</th>
                    <th>Sigrar</th>
                    <th>Sett</th>
                    <th>Mörk</th>
                    <th>Assist</th>
                    <th>G+A</th>
                    <th>SM</th>
                  </tr>
                </thead>
                <tbody>
                  {playerSummary.map((summary) => (
                    <tr key={summary.player.id}>
                      <td>{summary.player.name}</td>
                      <td>{summary.team}</td>
                      <td>{summary.player.roleAtSession === 'REGULAR' ? 'F' : 'V'}</td>
                      <td>{summary.games}</td>
                      <td>{summary.wins}</td>
                      <td>{summary.sets}</td>
                      <td>{summary.goals}</td>
                      <td>{summary.assists}</td>
                      <td><strong>{summary.goalContributions}</strong></td>
                      <td>{summary.ownGoals || '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="summary-note">
              F = fastamaður · V = varamaður · SM = sjálfsmark. Sama yfirlit verður lokaskjár þegar raunverulegt „Klára kvöld“ flæði kemur inn.
            </p>
            <button className="primary huge" onClick={() => setShowSummary(false)}>Til baka í leik</button>
          </div>
        </div>
      )}

      {pendingGoal && !pendingGoal.scorerId && !pendingGoal.ownGoal && (
        <div className="modal-backdrop">
          <div className="modal">
            <p className="eyebrow">MARK {pendingGoal.team}</p>
            <h2>Hver skoraði?</h2>
            <div className="player-buttons">
              {scoringPlayers(pendingGoal.team).map((p) => (
                <button key={p.id} onClick={() => setPendingGoal({ ...pendingGoal, scorerId: p.id })}>
                  {p.name} {p.roleAtSession === 'SUBSTITUTE' && <small>V</small>}
                </button>
              ))}
            </div>
            <button className="secondary" onClick={() => setPendingGoal({ ...pendingGoal, ownGoal: true })}>Sjálfsmark</button>
            <button className="ghost" onClick={() => setPendingGoal(null)}>Hætta við</button>
          </div>
        </div>
      )}

      {pendingGoal?.ownGoal && !pendingGoal.scorerId && (
        <div className="modal-backdrop">
          <div className="modal">
            <p className="eyebrow">SJÁLFSMARK</p>
            <h2>Hver setti hann í eigið?</h2>
            <div className="player-buttons">
              {opponentPlayers(pendingGoal.team).map((p) => (
                <button key={p.id} onClick={() => chooseOwnGoalScorer(p.id)}>{p.name}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {pendingGoal?.scorerId && !pendingGoal.ownGoal && (
        <div className="modal-backdrop">
          <div className="modal">
            <p className="eyebrow">MARK {pendingGoal.team}</p>
            <h2>Stoðsending?</h2>
            <div className="player-buttons">
              {scoringPlayers(pendingGoal.team)
                .filter((p) => p.id !== pendingGoal.scorerId)
                .map((p) => <button key={p.id} onClick={() => chooseAssist(p.id)}>{p.name}</button>)}
            </div>
            <button className="secondary" onClick={() => chooseAssist(null)}>Engin stoðsending</button>
          </div>
        </div>
      )}

      {timeoutNeedsChoice && (
        <div className="modal-backdrop">
          <div className="modal">
            <p className="eyebrow">TÍMI!</p>
            <h2>Hvort liðið fer út?</h2>
            <p>Þetta þarf aðeins þegar ekkert lið hefur enn verið skilgreint sem lengur inni.</p>
            <div className="goal-row">
              <button className="goal-button" onClick={() => chooseTimeoutOutgoing(g.team1)}>{g.team1} út</button>
              <button className="goal-button" onClick={() => chooseTimeoutOutgoing(g.team2)}>{g.team2} út</button>
            </div>
          </div>
        </div>
      )}

      {raceWinner && (
        <div className="modal-backdrop">
          <div className="modal winner-modal">
            <div className="trophy">🏆</div>
            <h2>{raceWinner} vinnur stigið</h2>
            <p>Stigalotan er nú endurstillt í 0–0–0. Rotation heldur áfram frá síðasta leik.</p>
            <button className="primary huge" onClick={() => setRaceWinner(null)}>Áfram</button>
          </div>
        </div>
      )}
    </main>
  )
}

export default App
