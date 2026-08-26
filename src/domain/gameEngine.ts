import type { ActiveMiniGame, Session, TeamCode } from './types'

export const DEFAULT_GAME_SECONDS = 180
export const DEFAULT_WINS_REQUIRED = 4

const teamCodes: TeamCode[] = ['A', 'B', 'C']

export function emptyTeamScore(): Record<TeamCode, number> {
  return { A: 0, B: 0, C: 0 }
}

function activeCodes(session: Session): TeamCode[] {
  return session.teams.map((t) => t.code)
}

function durationMs(session: Session) {
  return session.gameDurationSeconds * 1000
}

export function createActiveGame(
  session: Pick<Session, 'gameDurationSeconds'>,
  setId: string,
  sequenceNumber: number,
  team1: TeamCode,
  team2: TeamCode,
  waitingTeam: TeamCode | null,
  incumbentTeam: TeamCode | null,
): ActiveMiniGame {
  return {
    id: crypto.randomUUID(),
    setId,
    sequenceNumber,
    team1,
    team2,
    waitingTeam,
    incumbentTeam,
    status: 'READY',
    remainingMs: session.gameDurationSeconds * 1000,
    deadlineAt: null,
    startedAt: null,
  }
}

export function createSession(input: {
  seasonId: string
  sessionDate: string
  teamCount: 2 | 3
  teams: Session['teams']
  players: Session['players']
  openingTeam1?: TeamCode
  openingTeam2?: TeamCode
  gameDurationSeconds?: number
  winsRequired?: number
}): Session {
  const now = Date.now()
  const setId = crypto.randomUUID()
  const codes = input.teams.map((t) => t.code)
  const team1 = input.openingTeam1 ?? codes[0] ?? 'A'
  const team2 = input.openingTeam2 ?? codes[1] ?? 'B'
  const waitingTeam = input.teamCount === 3 ? (codes.find((c) => c !== team1 && c !== team2) ?? null) : null
  const gameDurationSeconds = input.gameDurationSeconds ?? DEFAULT_GAME_SECONDS

  const draft: Session = {
    id: crypto.randomUUID(),
    seasonId: input.seasonId,
    sessionDate: input.sessionDate,
    teamCount: input.teamCount,
    gameDurationSeconds,
    winsRequired: input.winsRequired ?? DEFAULT_WINS_REQUIRED,
    status: 'ACTIVE',
    teams: input.teams,
    players: input.players,
    setNumber: 1,
    currentSetId: setId,
    setWins: emptyTeamScore(),
    sessionSets: emptyTeamScore(),
    activeGame: {
      id: '', setId, sequenceNumber: 1, team1, team2, waitingTeam, incumbentTeam: null,
      status: 'READY', remainingMs: gameDurationSeconds * 1000, deadlineAt: null, startedAt: null,
    },
    miniGames: [], goals: [], timerEvents: [], completedSets: [],
    startedAt: now,
    endedAt: null,
    createdAt: now,
    updatedAt: now,
  }
  return { ...draft, activeGame: createActiveGame(draft, setId, 1, team1, team2, waitingTeam, null) }
}

export function startGame(session: Session, now = Date.now()): Session {
  const game = session.activeGame
  if (game.status !== 'READY') return session
  return {
    ...session,
    activeGame: { ...game, status: 'RUNNING', deadlineAt: now + game.remainingMs, startedAt: game.startedAt ?? now },
    timerEvents: [...session.timerEvents, { id: crypto.randomUUID(), type: 'START', miniGameId: game.id, timestamp: now }],
    updatedAt: now,
  }
}

export function pauseGame(session: Session, now = Date.now()): Session {
  const game = session.activeGame
  if (game.status !== 'RUNNING' || !game.deadlineAt) return session
  return {
    ...session,
    activeGame: { ...game, status: 'PAUSED', remainingMs: Math.max(0, game.deadlineAt - now), deadlineAt: null },
    timerEvents: [...session.timerEvents, { id: crypto.randomUUID(), type: 'PAUSE', miniGameId: game.id, timestamp: now }],
    updatedAt: now,
  }
}

export function resumeGame(session: Session, now = Date.now()): Session {
  const game = session.activeGame
  if (game.status !== 'PAUSED') return session
  return {
    ...session,
    activeGame: { ...game, status: 'RUNNING', deadlineAt: now + game.remainingMs },
    timerEvents: [...session.timerEvents, { id: crypto.randomUUID(), type: 'RESUME', miniGameId: game.id, timestamp: now }],
    updatedAt: now,
  }
}

export function freezeForGoal(session: Session, now = Date.now()): Session {
  const game = session.activeGame
  if (game.status !== 'RUNNING' || !game.deadlineAt) return session
  return {
    ...session,
    activeGame: { ...game, status: 'PAUSED', remainingMs: Math.max(0, game.deadlineAt - now), deadlineAt: null },
    updatedAt: now,
  }
}

export function recoverSession(session: Session, now = Date.now()): Session {
  if (session.status !== 'ACTIVE' || session.activeGame.status !== 'RUNNING') return session
  const game = session.activeGame
  const remaining = game.deadlineAt ? Math.max(0, game.deadlineAt - now) : game.remainingMs
  return {
    ...session,
    activeGame: { ...game, status: 'PAUSED', remainingMs: remaining, deadlineAt: null },
    updatedAt: now,
  }
}

function recordGame(
  session: Session,
  winnerTeam: TeamCode | null,
  outgoingTeam: TeamCode | null,
  incomingTeam: TeamCode | null,
  endReason: 'GOAL' | 'TIME_EXPIRED',
  now: number,
) {
  const game = session.activeGame
  return {
    id: game.id,
    setId: game.setId,
    setNumber: session.setNumber,
    sequenceNumber: game.sequenceNumber,
    team1: game.team1,
    team2: game.team2,
    waitingTeam: game.waitingTeam,
    incumbentTeam: game.incumbentTeam,
    winnerTeam,
    outgoingTeam,
    incomingTeam,
    endReason,
    startedAt: game.startedAt,
    endedAt: now,
  } as const
}

function nextAfterRotation(
  session: Session,
  stayingTeam: TeamCode,
  incomingTeam: TeamCode,
  outgoingTeam: TeamCode,
  setId = session.currentSetId,
) {
  return createActiveGame(
    session,
    setId,
    session.activeGame.sequenceNumber + 1,
    stayingTeam,
    incomingTeam,
    outgoingTeam,
    stayingTeam,
  )
}

export function completeGoal(
  session: Session,
  scoringTeam: TeamCode,
  scorerId: string,
  assistId: string | null,
  ownGoal: boolean,
  now = Date.now(),
): { session: Session; setWinner: TeamCode | null } {
  const game = session.activeGame
  if (!['RUNNING', 'PAUSED'].includes(game.status)) return { session, setWinner: null }
  if (scoringTeam !== game.team1 && scoringTeam !== game.team2) return { session, setWinner: null }

  const losingTeam = game.team1 === scoringTeam ? game.team2 : game.team1
  const incomingTeam = game.waitingTeam
  const record = recordGame(session, scoringTeam, incomingTeam ? losingTeam : null, incomingTeam, 'GOAL', now)
  const nextSetWins = { ...session.setWins, [scoringTeam]: session.setWins[scoringTeam] + 1 }
  const wonSet = nextSetWins[scoringTeam] >= session.winsRequired
  let setNumber = session.setNumber
  let currentSetId = session.currentSetId
  let setWins = nextSetWins
  let sessionSets = session.sessionSets
  let completedSets = session.completedSets
  let setWinner: TeamCode | null = null

  if (wonSet) {
    setWinner = scoringTeam
    sessionSets = { ...sessionSets, [scoringTeam]: sessionSets[scoringTeam] + 1 }
    completedSets = [...completedSets, {
      id: session.currentSetId,
      setNumber: session.setNumber,
      winnerTeam: scoringTeam,
      wonAt: now,
      finalWins: nextSetWins,
    }]
    setNumber += 1
    currentSetId = crypto.randomUUID()
    setWins = emptyTeamScore()
  }

  let nextGame: ActiveMiniGame
  if (incomingTeam) {
    nextGame = nextAfterRotation(session, scoringTeam, incomingTeam, losingTeam, currentSetId)
  } else {
    nextGame = createActiveGame(session, currentSetId, game.sequenceNumber + 1, game.team1, game.team2, null, null)
  }

  return {
    setWinner,
    session: {
      ...session,
      setNumber,
      currentSetId,
      setWins,
      sessionSets,
      completedSets,
      miniGames: [...session.miniGames, record],
      goals: [...session.goals, {
        id: crypto.randomUUID(), type: ownGoal ? 'OWN_GOAL' : 'GOAL', scoringTeam, scorerId,
        assistId: ownGoal ? null : assistId, miniGameId: game.id, createdAt: now,
      }],
      activeGame: nextGame,
      updatedAt: now,
    },
  }
}

export function completeTimeout(session: Session, forcedOutgoing?: TeamCode, now = Date.now()): Session {
  const game = session.activeGame
  if (!['RUNNING', 'PAUSED'].includes(game.status)) return session

  if (!game.waitingTeam) {
    const record = recordGame(session, null, null, null, 'TIME_EXPIRED', now)
    return {
      ...session,
      miniGames: [...session.miniGames, record],
      timerEvents: [...session.timerEvents, { id: crypto.randomUUID(), type: 'EXPIRE', miniGameId: game.id, timestamp: now }],
      activeGame: createActiveGame(session, session.currentSetId, game.sequenceNumber + 1, game.team1, game.team2, null, null),
      updatedAt: now,
    }
  }

  const outgoing = game.incumbentTeam ?? forcedOutgoing ?? null
  if (!outgoing || (outgoing !== game.team1 && outgoing !== game.team2)) return session
  const staying = game.team1 === outgoing ? game.team2 : game.team1
  const record = recordGame(session, null, outgoing, game.waitingTeam, 'TIME_EXPIRED', now)

  return {
    ...session,
    miniGames: [...session.miniGames, record],
    timerEvents: [...session.timerEvents, { id: crypto.randomUUID(), type: 'EXPIRE', miniGameId: game.id, timestamp: now }],
    activeGame: nextAfterRotation(session, staying, game.waitingTeam, outgoing),
    updatedAt: now,
  }
}

export function closeSession(session: Session, now = Date.now()): Session {
  let next = session
  if (next.activeGame.status === 'RUNNING') next = pauseGame(next, now)
  return { ...next, status: 'CLOSED', endedAt: now, updatedAt: now }
}

export function activeTeamCodes(session: Session) {
  return activeCodes(session)
}
