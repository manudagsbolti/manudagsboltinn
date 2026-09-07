import { useEffect, useMemo, useReducer } from 'react'
import { createMatchState, matchReducer } from '../domain/matchMachine'

const teams = {
  red: { name: 'Rautt', className: 'team-red' },
  blue: { name: 'Blátt', className: 'team-blue' },
  yellow: { name: 'Gult', className: 'team-yellow' },
} as const

type TeamId = keyof typeof teams

export function MatchBoard() {
  const [state, dispatch] = useReducer(
    matchReducer,
    createMatchState({
      holderTeamId: 'red',
      challengerTeamId: 'blue',
      waitingTeamId: 'yellow',
      durationSeconds: 180,
    }),
  )

  useEffect(() => {
    if (state.status !== 'live') return
    const timer = window.setInterval(() => dispatch({ type: 'TICK' }), 1000)
    return () => window.clearInterval(timer)
  }, [state.status])

  const clock = useMemo(() => {
    const minutes = Math.floor(state.remainingSeconds / 60)
    const seconds = state.remainingSeconds % 60
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }, [state.remainingSeconds])

  const holder = teams[state.holderTeamId as TeamId]
  const challenger = teams[state.challengerTeamId as TeamId]
  const waiting = state.waitingTeamId ? teams[state.waitingTeamId as TeamId] : null

  return (
    <section className="match-card">
      <div className="eyebrow">V1 MATCH ENGINE · LEIKUR {state.gameNo}</div>
      <div className="match-grid">
        <TeamButton team={holder} onGoal={() => dispatch({ type: 'GOAL', teamId: state.holderTeamId })} disabled={state.status !== 'live'} />
        <div className="clock-wrap">
          <div className="clock">{clock}</div>
          <div className="status">{statusLabel(state.status, state.endReason)}</div>
        </div>
        <TeamButton team={challenger} onGoal={() => dispatch({ type: 'GOAL', teamId: state.challengerTeamId })} disabled={state.status !== 'live'} />
      </div>

      <div className="controls">
        {state.status === 'ready' && <button className="primary" onClick={() => dispatch({ type: 'START' })}>START</button>}
        {state.status === 'live' && <button onClick={() => dispatch({ type: 'PAUSE' })}>PAUSE</button>}
        {state.status === 'paused' && <button className="primary" onClick={() => dispatch({ type: 'RESUME' })}>RESUME</button>}
        {(state.status === 'live' || state.status === 'paused') && <button onClick={() => dispatch({ type: 'TIMEOUT' })}>END / TIMEOUT</button>}
        {state.status === 'completed' && <button className="primary" onClick={() => dispatch({ type: 'NEXT_GAME' })}>NÆSTI LEIKUR</button>}
      </div>

      {state.status === 'completed' && (
        <div className="result">
          {state.endReason === 'goal'
            ? `⚽ ${teams[state.winningTeamId as TeamId]?.name ?? ''} vinnur litla sigurinn.`
            : `⏱ Tími. ${teams[state.exitingTeamId as TeamId]?.name ?? ''} fer út.`}
        </div>
      )}

      <div className="waiting">Bíður: <strong>{waiting?.name ?? '—'}</strong></div>
      <p className="hint">Þessi skjár er developer preview á pure state machine. Næsta lag tengir mark við markaskorara/stoðsendingu og Dexie.</p>
    </section>
  )
}

function TeamButton({ team, onGoal, disabled }: {
  team: { name: string; className: string }
  onGoal: () => void
  disabled: boolean
}) {
  return (
    <button className={`team-button ${team.className}`} onClick={onGoal} disabled={disabled}>
      <span>{team.name}</span>
      <small>⚽ MARK</small>
    </button>
  )
}

function statusLabel(status: string, endReason: string | null): string {
  if (status === 'ready') return 'Tilbúið'
  if (status === 'live') return 'Í gangi'
  if (status === 'paused') return 'Pása'
  return endReason === 'goal' ? 'Mark' : 'Leik lokið'
}
