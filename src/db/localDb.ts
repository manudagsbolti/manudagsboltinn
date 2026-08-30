import Dexie, { type EntityTable, type Table } from 'dexie'
import type { Game, Goal, Player, Season, Session, SessionPlayer, SetRecord, SetTeam, SetTeamMember, UUID } from '../domain/types'

export interface SyncQueueItem {
  id: UUID
  table: 'players' | 'seasons' | 'sessions' | 'session_players' | 'sets' | 'set_teams' | 'set_team_members' | 'games' | 'goals'
  entityId: string
  operation: 'upsert'
  payload: unknown
  createdAt: string
  attempts: number
  lastError?: string | null
}

export class ManudagsboltinnDb extends Dexie {
  players!: EntityTable<Player, 'id'>
  seasons!: EntityTable<Season, 'id'>
  sessions!: EntityTable<Session, 'id'>
  sessionPlayers!: Table<SessionPlayer, [UUID, UUID]>
  sets!: EntityTable<SetRecord, 'id'>
  setTeams!: EntityTable<SetTeam, 'id'>
  setTeamMembers!: Table<SetTeamMember, [UUID, UUID]>
  games!: EntityTable<Game, 'id'>
  goals!: EntityTable<Goal, 'id'>
  syncQueue!: EntityTable<SyncQueueItem, 'id'>

  constructor() {
    super('manudagsboltinn')
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
  }
}

export const db = new ManudagsboltinnDb()
