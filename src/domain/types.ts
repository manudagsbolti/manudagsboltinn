export type PlayerRole = 'REGULAR' | 'SUBSTITUTE'
export type TeamCode = 'A' | 'B' | 'C'
export type TimerStatus = 'READY' | 'RUNNING' | 'PAUSED' | 'FINISHED'
export type SessionStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED'
export type SeasonStatus = 'PLANNED' | 'ACTIVE' | 'CLOSED'
export type EndReason = 'GOAL' | 'TIME_EXPIRED'
export type GoalEventType = 'GOAL' | 'OWN_GOAL'
export type TimerEventType = 'START' | 'PAUSE' | 'RESUME' | 'EXPIRE'

export interface Player {
  id: string
  name: string
  nickname: string | null
  active: boolean
  createdAt: number
  updatedAt: number
}

export interface Season {
  id: string
  name: string
  startDate: string
  endDate: string
  status: SeasonStatus
  createdAt: number
  updatedAt: number
}

export interface PlayerRolePeriod {
  id: string
  seasonId: string
  playerId: string
  role: PlayerRole
  validFrom: string
  validTo: string | null
  createdAt: number
  updatedAt: number
}

export interface SessionTeam {
  id: string
  code: TeamCode
}

export interface SessionPlayer {
  id: string
  playerId: string
  roleAtSession: PlayerRole
  teamCode: TeamCode
  present: boolean
}

export interface GoalEvent {
  id: string
  type: GoalEventType
  scoringTeam: TeamCode
  scorerId: string
  assistId: string | null
  miniGameId: string
  createdAt: number
}

export interface TimerEvent {
  id: string
  type: TimerEventType
  miniGameId: string
  timestamp: number
}

export interface MiniGameRecord {
  id: string
  setId: string
  setNumber: number
  sequenceNumber: number
  team1: TeamCode
  team2: TeamCode
  waitingTeam: TeamCode | null
  incumbentTeam: TeamCode | null
  winnerTeam: TeamCode | null
  outgoingTeam: TeamCode | null
  incomingTeam: TeamCode | null
  endReason: EndReason
  startedAt: number | null
  endedAt: number
}

export interface ActiveMiniGame {
  id: string
  setId: string
  sequenceNumber: number
  team1: TeamCode
  team2: TeamCode
  waitingTeam: TeamCode | null
  incumbentTeam: TeamCode | null
  status: TimerStatus
  remainingMs: number
  deadlineAt: number | null
  startedAt: number | null
}

export interface SetWin {
  id: string
  setNumber: number
  winnerTeam: TeamCode
  wonAt: number
  finalWins: Record<TeamCode, number>
}

export interface Session {
  id: string
  seasonId: string
  sessionDate: string
  teamCount: 2 | 3
  gameDurationSeconds: number
  winsRequired: number
  status: SessionStatus
  teams: SessionTeam[]
  players: SessionPlayer[]
  setNumber: number
  currentSetId: string
  setWins: Record<TeamCode, number>
  sessionSets: Record<TeamCode, number>
  activeGame: ActiveMiniGame
  miniGames: MiniGameRecord[]
  goals: GoalEvent[]
  timerEvents: TimerEvent[]
  completedSets: SetWin[]
  startedAt: number | null
  endedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface SyncMeta {
  pending: boolean
  lastSyncAt: number | null
  lastError: string | null
  deviceId: string
}

export interface AppState {
  version: 2
  players: Player[]
  seasons: Season[]
  rolePeriods: PlayerRolePeriod[]
  sessions: Session[]
  activeSessionId: string | null
  selectedSeasonId: string | null
  sync: SyncMeta
  updatedAt: number
}

export interface PlayerSessionStats {
  playerId: string
  playerName: string
  teamCode: TeamCode
  roleAtSession: PlayerRole
  miniGames: number
  wins: number
  sets: number
  goals: number
  assists: number
  goalContributions: number
  ownGoals: number
  chokes: number
  nix: number
  winPct: number
}

export interface TeamSessionStats {
  teamCode: TeamCode
  players: number
  miniGames: number
  wins: number
  sets: number
  goals: number
  chokes: number
  nix: number
  winPct: number
}

export interface SeasonPlayerStats {
  playerId: string
  playerName: string
  appearances: number
  eligibleSessions: number
  attendancePct: number
  miniGames: number
  wins: number
  sets: number
  goals: number
  assists: number
  goalContributions: number
  ownGoals: number
  chokes: number
  nix: number
  winPct: number
}

export interface PairStats {
  key: string
  player1Id: string
  player2Id: string
  player1Name: string
  player2Name: string
  appearancesTogether: number
  miniGames: number
  wins: number
  sets: number
  winPct: number
}
