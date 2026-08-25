import type { ActiveMiniGame, MiniGameRecord, SessionState, TeamCode } from '../types'

export const GAME_DURATION_MS = 180_000
export const WINS_REQUIRED = 4

function newActiveGame(
  previous: ActiveMiniGame,
  stayingTeam: TeamCode,
  incomingTeam: TeamCode | null,
  waitingTeam: TeamCode | null,
): ActiveMiniGame {
  const nextOpponent = incomingTeam ?? (previous.team1 === stayingTeam ? previous.team2 : previous.team1)
  return {
    id: crypto.randomUUID(),
    sequenceNumber: previous.sequenceNumber + 1,
    team1: stayingTeam,
    team2: nextOpponent,
    waitingTeam,
    incumbentTeam: incomingTeam ? stayingTeam : null,
    status: 'READY',
    remainingMs: GAME_DURATION_MS,
    deadlineAt: null,
    startedAt: null,
  }
}

export function startGame(state: SessionState, now = Date.now()): SessionState {
  if (state.activeGame.status !== 'READY') return state
  return {
    ...state,
    activeGame: {
      ...state.activeGame,
      status: 'RUNNING',
      deadlineAt: now + state.activeGame.remainingMs,
      startedAt: state.activeGame.startedAt ?? now,
    },
    timerEvents: [
      ...state.timerEvents,
      { id: crypto.randomUUID(), type: 'START', miniGameId: state.activeGame.id, timestamp: now },
    ],
    lastUpdatedAt: now,
  }
}


export function freezeGameForGoal(state: SessionState, now = Date.now()): SessionState {
  const game = state.activeGame
  if (game.status === 'PAUSED') return state
  if (game.status !== 'RUNNING' || !game.deadlineAt) return state
  return {
    ...state,
    activeGame: {
      ...game,
      status: 'PAUSED',
      remainingMs: Math.max(0, game.deadlineAt - now),
      deadlineAt: null,
    },
    lastUpdatedAt: now,
  }
}

export function pauseGame(state: SessionState, now = Date.now()): SessionState {
  const game = state.activeGame
  if (game.status !== 'RUNNING' || !game.deadlineAt) return state
  return {
    ...state,
    activeGame: {
      ...game,
      status: 'PAUSED',
      remainingMs: Math.max(0, game.deadlineAt - now),
      deadlineAt: null,
    },
    timerEvents: [
      ...state.timerEvents,
      { id: crypto.randomUUID(), type: 'PAUSE', miniGameId: game.id, timestamp: now },
    ],
    lastUpdatedAt: now,
  }
}

export function resumeGame(state: SessionState, now = Date.now()): SessionState {
  const game = state.activeGame
  if (game.status !== 'PAUSED') return state
  return {
    ...state,
    activeGame: { ...game, status: 'RUNNING', deadlineAt: now + game.remainingMs },
    timerEvents: [
      ...state.timerEvents,
      { id: crypto.randomUUID(), type: 'RESUME', miniGameId: game.id, timestamp: now },
    ],
    lastUpdatedAt: now,
  }
}

export function recoverRunningGameAsPaused(state: SessionState, now = Date.now()): SessionState {
  const game = state.activeGame
  if (game.status !== 'RUNNING') return state
  const remainingMs = game.deadlineAt ? Math.max(0, game.deadlineAt - now) : game.remainingMs
  return {
    ...state,
    activeGame: { ...game, status: 'PAUSED', remainingMs, deadlineAt: null },
    lastUpdatedAt: now,
  }
}

function completeRecord(
  state: SessionState,
  winnerTeam: TeamCode | null,
  outgoingTeam: TeamCode | null,
  incomingTeam: TeamCode | null,
  reason: 'GOAL' | 'TIME_EXPIRED',
  now: number,
): MiniGameRecord {
  const g = state.activeGame
  return {
    id: g.id,
    pointRaceNumber: state.raceNumber,
    sequenceNumber: g.sequenceNumber,
    team1: g.team1,
    team2: g.team2,
    waitingTeam: g.waitingTeam,
    incumbentTeam: g.incumbentTeam,
    winnerTeam,
    outgoingTeam,
    incomingTeam,
    endReason: reason,
    startedAt: g.startedAt,
    endedAt: now,
  }
}

export function completeGoal(
  state: SessionState,
  goalTeam: TeamCode,
  scorerId: string,
  assistId: string | null,
  ownGoal: boolean,
  now = Date.now(),
): SessionState {
  const g = state.activeGame
  if (!['RUNNING', 'PAUSED'].includes(g.status)) return state
  if (goalTeam !== g.team1 && goalTeam !== g.team2) return state

  const losingTeam = g.team1 === goalTeam ? g.team2 : g.team1
  const incomingTeam = g.waitingTeam
  const record = completeRecord(state, goalTeam, incomingTeam ? losingTeam : null, incomingTeam, 'GOAL', now)
  const nextRaceWins = { ...state.raceWins, [goalTeam]: state.raceWins[goalTeam] + 1 }
  const raceWon = nextRaceWins[goalTeam] >= WINS_REQUIRED

  let raceNumber = state.raceNumber
  let raceWins = nextRaceWins
  let sessionPoints = state.sessionPoints
  let pointRaceWins = state.pointRaceWins

  if (raceWon) {
    sessionPoints = { ...sessionPoints, [goalTeam]: sessionPoints[goalTeam] + 1 }
    pointRaceWins = [
      ...pointRaceWins,
      { pointRaceNumber: state.raceNumber, winnerTeam: goalTeam, wonAt: now, finalWins: nextRaceWins },
    ]
    raceNumber += 1
    raceWins = { A: 0, B: 0, C: 0 }
  }

  return {
    ...state,
    raceNumber,
    raceWins,
    sessionPoints,
    pointRaceWins,
    miniGames: [...state.miniGames, record],
    goals: [
      ...state.goals,
      {
        id: crypto.randomUUID(),
        type: ownGoal ? 'OWN_GOAL' : 'GOAL',
        team: goalTeam,
        scorerId,
        assistId: ownGoal ? null : assistId,
        miniGameId: g.id,
        createdAt: now,
      },
    ],
    activeGame: incomingTeam
      ? newActiveGame(g, goalTeam, incomingTeam, losingTeam)
      : {
          ...g,
          id: crypto.randomUUID(),
          sequenceNumber: g.sequenceNumber + 1,
          status: 'READY',
          remainingMs: GAME_DURATION_MS,
          deadlineAt: null,
          startedAt: null,
          incumbentTeam: null,
        },
    lastUpdatedAt: now,
  }
}

export function completeTimeout(
  state: SessionState,
  forcedOutgoing?: TeamCode,
  now = Date.now(),
): SessionState {
  const g = state.activeGame
  if (!['RUNNING', 'PAUSED'].includes(g.status)) return state

  const incoming = g.waitingTeam

  // With only two teams there is no rotation. A timeout simply closes the
  // current 3-minute mini-game and prepares the same matchup for a manual restart.
  if (!incoming) {
    const record = completeRecord(state, null, null, null, 'TIME_EXPIRED', now)
    return {
      ...state,
      miniGames: [...state.miniGames, record],
      timerEvents: [
        ...state.timerEvents,
        { id: crypto.randomUUID(), type: 'EXPIRE', miniGameId: g.id, timestamp: now },
      ],
      activeGame: {
        ...g,
        id: crypto.randomUUID(),
        sequenceNumber: g.sequenceNumber + 1,
        status: 'READY',
        remainingMs: GAME_DURATION_MS,
        deadlineAt: null,
        startedAt: null,
        incumbentTeam: null,
      },
      lastUpdatedAt: now,
    }
  }

  const outgoing = g.incumbentTeam ?? forcedOutgoing ?? null
  if (!outgoing) return state
  if (outgoing !== g.team1 && outgoing !== g.team2) return state

  const staying = g.team1 === outgoing ? g.team2 : g.team1
  const record = completeRecord(state, null, outgoing, incoming, 'TIME_EXPIRED', now)

  return {
    ...state,
    miniGames: [...state.miniGames, record],
    timerEvents: [
      ...state.timerEvents,
      { id: crypto.randomUUID(), type: 'EXPIRE', miniGameId: g.id, timestamp: now },
    ],
    activeGame: newActiveGame(g, staying, incoming, outgoing),
    lastUpdatedAt: now,
  }
}
