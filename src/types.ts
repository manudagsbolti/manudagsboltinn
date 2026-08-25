export type PlayerRole = 'REGULAR' | 'SUBSTITUTE'
export type TeamCode = 'A' | 'B' | 'C'
export type TimerStatus = 'READY' | 'RUNNING' | 'PAUSED' | 'FINISHED'
export type EndReason = 'GOAL' | 'TIME_EXPIRED'

export interface Player {
  id: string
  name: string
  roleAtSession: PlayerRole
}

export interface Team {
  id: TeamCode
  players: Player[]
}

export interface GoalEvent {
  id: string
  type: 'GOAL' | 'OWN_GOAL'
  team: TeamCode
  scorerId: string
  assistId: string | null
  miniGameId: string
  createdAt: number
}

export interface TimerEvent {
  id: string
  type: 'START' | 'PAUSE' | 'RESUME' | 'EXPIRE'
  miniGameId: string
  timestamp: number
}

export interface MiniGameRecord {
  id: string
  pointRaceNumber: number
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

export interface PointRaceWin {
  pointRaceNumber: number
  winnerTeam: TeamCode
  wonAt: number
  finalWins: Record<TeamCode, number>
}

export interface SessionState {
  version: 1
  sessionId: string
  sessionDate: string
  teams: Team[]
  raceNumber: number
  raceWins: Record<TeamCode, number>
  sessionPoints: Record<TeamCode, number>
  activeGame: ActiveMiniGame
  miniGames: MiniGameRecord[]
  goals: GoalEvent[]
  timerEvents: TimerEvent[]
  pointRaceWins: PointRaceWin[]
  lastUpdatedAt: number
}
