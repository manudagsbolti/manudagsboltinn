export type UUID = string
export type IsoDateTime = string

export type SessionStatus = 'draft' | 'live' | 'completed'
export type SetStatus = 'ready' | 'live' | 'completed'
export type GameStatus = 'ready' | 'live' | 'paused' | 'completed'
export type GameEndReason = 'goal' | 'timeout' | 'manual'

export interface Player {
  id: UUID
  name: string
  nickname?: string | null
  isActive: boolean
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface Season {
  id: UUID
  name: string
  startsOn: string
  endsOn?: string | null
  isActive: boolean
}

export interface Session {
  id: UUID
  seasonId?: UUID | null
  playedOn: string
  status: SessionStatus
  gameDurationSeconds: number
  winsPerPoint: number
  pointsToWinSet: number
  startedAt?: IsoDateTime | null
  completedAt?: IsoDateTime | null
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface SessionPlayer {
  sessionId: UUID
  playerId: UUID
}

export interface SetRecord {
  id: UUID
  sessionId: UUID
  setNo: number
  status: SetStatus
  winningTeamId?: UUID | null
  startedAt?: IsoDateTime | null
  endedAt?: IsoDateTime | null
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface SetTeam {
  id: UUID
  setId: UUID
  name: string
  color: string
  sortOrder: number
}

export interface SetTeamMember {
  setId: UUID
  teamId: UUID
  playerId: UUID
}

export interface Game {
  id: UUID
  setId: UUID
  gameNo: number
  holderTeamId: UUID
  challengerTeamId: UUID
  waitingTeamId?: UUID | null
  status: GameStatus
  startedAt?: IsoDateTime | null
  endedAt?: IsoDateTime | null
  durationSeconds: number
  remainingSeconds: number
  timerStartedAt?: IsoDateTime | null
  endReason?: GameEndReason | null
  winningTeamId?: UUID | null
  exitingTeamId?: UUID | null
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface Goal {
  id: UUID
  gameId: UUID
  teamId: UUID
  scorerPlayerId: UUID
  assistPlayerId?: UUID | null
  secondsElapsed: number
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
  deletedAt?: IsoDateTime | null
}

export interface TeamSetStats {
  teamId: UUID
  smallWins: number
  points: number
  progressWins: number
  isWinner: boolean
  isChoke: boolean
  isZeroPointSet: boolean
}

export interface PlayerSessionStats {
  playerId: UUID
  points: number
  smallWins: number
  setsPlayed: number
  goals: number
  assists: number
  setWins: number
  chokes: number
  zeroPointSets: number
  nixDay: boolean
}

export interface AllTimePlayerStats extends PlayerSessionStats {
  sessions: number
  nixDays: number
}
