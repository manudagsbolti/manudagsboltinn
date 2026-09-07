import Dexie, { type EntityTable, type Table } from 'dexie'
import type { Game, Goal, Player, PlayerRolePeriod, Season, Session, SessionBackfill, SessionPlayer, SetRecord, SetTeam, SetTeamMember, UUID } from '../domain/types'

export interface TimerEvent {
  id: UUID
  gameId: UUID
  eventType: 'START' | 'PAUSE' | 'RESUME' | 'EXPIRE'
  occurredAt: string
}

export interface UndoAction {
  id: UUID
  sessionId: UUID
  game: Game
  set: SetRecord
  goalId?: UUID
  timerEventId?: UUID
  createdAt: string
}

export interface LocalSubmission {
  sessionId: UUID
  token: string
  state: 'queued' | 'pending' | 'approved' | 'rejected'
  payload: unknown
}

export interface SyncQueueItem {
  id: UUID
  table: 'players' | 'seasons' | 'player_role_periods' | 'sessions' | 'session_players' | 'session_backfills' | 'sets' | 'set_teams' | 'set_team_members' | 'games' | 'goals' | 'timer_events'
  entityId: string
  operation: 'upsert' | 'delete'
  payload: unknown
  createdAt: string
  attempts: number
  lastError?: string | null
}

export class ManudagsboltinnDb extends Dexie {
  players!: EntityTable<Player, 'id'>
  seasons!: EntityTable<Season, 'id'>
  rolePeriods!: EntityTable<PlayerRolePeriod, 'id'>
  sessions!: EntityTable<Session, 'id'>
  sessionPlayers!: Table<SessionPlayer, [UUID, UUID]>
  sessionBackfills!: EntityTable<SessionBackfill, 'sessionId'>
  sets!: EntityTable<SetRecord, 'id'>
  setTeams!: EntityTable<SetTeam, 'id'>
  setTeamMembers!: Table<SetTeamMember, [UUID, UUID]>
  games!: EntityTable<Game, 'id'>
  goals!: EntityTable<Goal, 'id'>
  timerEvents!: EntityTable<TimerEvent, 'id'>
  undoActions!: EntityTable<UndoAction, 'id'>
  syncQueue!: EntityTable<SyncQueueItem, 'id'>
  submissions!: EntityTable<LocalSubmission, 'sessionId'>

  constructor(name = 'manudagsboltinn') {
    super(name)
    this.version(1).stores({
      players: 'id, name, isActive, updatedAt',
      seasons: 'id, isActive, startsOn',
      sessions: 'id, seasonId, playedOn, status, updatedAt',
      sessionPlayers: '[sessionId+playerId], sessionId, playerId',
      sets: 'id, sessionId, [sessionId+setNo], status, winningTeamId, updatedAt',
      setTeams: 'id, setId, [setId+sortOrder]',
      setTeamMembers: '[teamId+playerId], [setId+playerId], setId, teamId, playerId',
      games: 'id, setId, [setId+gameNo], status, winningTeamId, updatedAt',
      goals: 'id, gameId, teamId, scorerPlayerId, assistPlayerId, createdAt, deletedAt',
      syncQueue: 'id, table, entityId, createdAt, attempts',
    })
    this.version(2).stores({
      games: 'id, setId, [setId+gameNo], status, winningTeamId, updatedAt',
    })
    this.version(3).stores({
      rolePeriods: 'id, seasonId, playerId, [seasonId+playerId], validFrom',
      sessionPlayers: '[sessionId+playerId], sessionId, playerId, roleAtSession',
      timerEvents: 'id, gameId, occurredAt, eventType',
      undoActions: 'id, sessionId, createdAt',
    }).upgrade(async tx => {
      await tx.table<Session, string>('sessions').toCollection().modify(session => {
        // V1 previously shipped an accidental 4x4 scoring model. Preserve custom
        // configurations, but migrate that known default to first-to-four.
        if (session.winsPerPoint === 4 && session.pointsToWinSet === 4) session.winsPerPoint = 1
      })
      await tx.table<SessionPlayer, [string, string]>('sessionPlayers').toCollection().modify(row => {
        if (!row.roleAtSession) row.roleAtSession = 'SUBSTITUTE'
      })
      await tx.table<Game, string>('games').toCollection().modify(game => {
        if (game.incumbentTeamId === undefined) game.incumbentTeamId = game.gameNo === 1 && game.waitingTeamId ? null : game.holderTeamId
      })
      await tx.table<Goal, string>('goals').toCollection().modify(goal => {
        if (!goal.eventType) goal.eventType = 'GOAL'
      })
    })
    this.version(4).stores({
      sessionBackfills: 'sessionId, sourceKind, updatedAt',
      sessionPlayers: '[sessionId+playerId], sessionId, playerId, roleAtSession, teamCode',
    })
    this.version(5).stores({}).upgrade(async tx => {
      const firstSets = await tx.table<SetRecord, string>('sets').filter(s => s.setNo === 1).toArray()
      const ids = new Set(firstSets.map(s => s.id))
      await tx.table<Game, string>('games').toCollection().modify(game => {
        if (ids.has(game.setId) && game.gameNo === 1 && game.status !== 'completed') game.incumbentTeamId = null
      })
    })
    this.version(6).stores({ submissions: 'sessionId, state' })
  }
}

export const db = new ManudagsboltinnDb()
