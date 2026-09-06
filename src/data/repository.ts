import Dexie from 'dexie'
import { defaultSeasonForDate, validateSeason } from '../domain/seasons'
import { validateGoal, validateTeams } from '../domain/validation'
import { db } from '../db/localDb'
import { nextRotation, type Rotation } from '../domain/matchMachine'
import { currentRemainingSeconds, getSetWinner } from '../domain/rules'
import type { Game, Goal, Player, PlayerRole, PlayerRolePeriod, Season, Session, SessionBackfill, SetRecord, SetTeam, SetTeamMember, UUID } from '../domain/types'
import { enqueueSync, flushSyncQueue } from '../services/syncQueue'
import { id, nowIso } from '../utils/id'

async function queuedPut(table: Parameters<typeof enqueueSync>[0]['table'], entityId: string, payload: unknown) {
  await enqueueSync({ id: id(), table, entityId, operation: 'upsert', payload, createdAt: nowIso() })
}

async function _addPlayer(name: string, nickname?: string): Promise<Player> {
  const now = nowIso()
  const player: Player = { id: id(), name: name.trim(), nickname: nickname?.trim() || null, isActive: true, createdAt: now, updatedAt: now }
  await db.players.add(player)
  await queuedPut('players', player.id, player)
  return player
}

async function _updatePlayer(playerId: UUID, patch: Partial<Pick<Player, 'name' | 'nickname' | 'isActive'>>): Promise<void> {
  const player = await db.players.get(playerId)
  if (!player) return
  const updated = { ...player, ...patch, updatedAt: nowIso() }
  await db.players.put(updated)
  await queuedPut('players', playerId, updated)
}

export function roleOnDate(periods: PlayerRolePeriod[], seasonId: UUID, playerId: UUID, date: string): PlayerRole {
  return periods
    .filter(p => p.seasonId === seasonId && p.playerId === playerId && p.validFrom <= date && (!p.validTo || p.validTo >= date))
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0]?.role ?? 'SUBSTITUTE'
}

async function _setPlayerRole(seasonId: UUID, playerId: UUID, role: PlayerRole, validFrom: string): Promise<void> {
  const now = nowIso()
  const existing = await db.rolePeriods.where('[seasonId+playerId]').equals([seasonId, playerId]).sortBy('validFrom')
  const previous = [...existing].reverse().find(p => p.validFrom < validFrom && (!p.validTo || p.validTo >= validFrom))
  const sameDate = existing.find(p => p.validFrom === validFrom)
  if (previous) {
    const end = new Date(`${validFrom}T12:00:00Z`); end.setUTCDate(end.getUTCDate() - 1)
    const updated = { ...previous, validTo: end.toISOString().slice(0, 10), updatedAt: now }
    await db.rolePeriods.put(updated); await queuedPut('player_role_periods', updated.id, updated)
  }
  const period: PlayerRolePeriod = sameDate
    ? { ...sameDate, role, updatedAt: now }
    : { id: id(), seasonId, playerId, role, validFrom, validTo: null, createdAt: now, updatedAt: now }
  await db.rolePeriods.put(period)
  await queuedPut('player_role_periods', period.id, period)
}

async function _ensureSeasonForDate(playedOn: string): Promise<Season> {
  const existing = (await db.seasons.toArray()).filter(s => s.startsOn <= playedOn && (!s.endsOn || s.endsOn >= playedOn)).sort((a,b) => Number(b.isActive)-Number(a.isActive))[0]
  if (existing) return existing
  const window = defaultSeasonForDate(playedOn)
  if (!window) throw new Error('Maí–ágúst er sumarfrí. Stofnaðu sérsniðna önn í stillingum ef spila á þetta kvöld.')
  const season: Season = { ...window, id: id(), isActive: true }
  const others = await db.seasons.toArray()
  await db.transaction('rw', db.seasons, async () => {
    for (const row of others.filter(x => x.isActive)) await db.seasons.update(row.id, { isActive: false })
    await db.seasons.add(season)
  })
  for (const row of others.filter(x => x.isActive)) await queuedPut('seasons', row.id, { ...row, isActive: false })
  await queuedPut('seasons', season.id, season)
  return season
}

async function _createSession(input: {
  seasonId?: UUID
  playedOn: string
  playerIds: UUID[]
  gameDurationSeconds: number
  winsPerPoint: number
  pointsToWinSet: number
}): Promise<Session> {
  const now = nowIso()
  const season = input.seasonId ? await db.seasons.get(input.seasonId) : await ensureSeasonForDate(input.playedOn)
  if (!season || input.playedOn < season.startsOn || (season.endsOn && input.playedOn > season.endsOn)) throw new Error('Dagsetningin þarf að vera innan valinnar annar.')
  const periods = await db.rolePeriods.where('seasonId').equals(season.id).toArray()
  const session: Session = {
    id: id(), seasonId: season.id, playedOn: input.playedOn, status: 'draft', gameDurationSeconds: input.gameDurationSeconds,
    winsPerPoint: input.winsPerPoint, pointsToWinSet: input.pointsToWinSet, startedAt: null, completedAt: null,
    createdAt: now, updatedAt: now,
  }
  await db.transaction('rw', db.sessions, db.sessionPlayers, async () => {
    await db.sessions.add(session)
    await db.sessionPlayers.bulkAdd(input.playerIds.map((playerId) => ({ sessionId: session.id, playerId, roleAtSession: roleOnDate(periods, season.id, playerId, input.playedOn) })))
  })
  await queuedPut('sessions', session.id, session)
  for (const playerId of input.playerIds) {
    const row = { sessionId: session.id, playerId, roleAtSession: roleOnDate(periods, season.id, playerId, input.playedOn) }
    await queuedPut('session_players', `${session.id}:${playerId}`, row)
  }
  return session
}

async function _createHistoricalSession(input: {
  playedOn: string
  teams: SessionBackfill['teams']
  rounds: SessionBackfill['rounds']
  playerGoals: SessionBackfill['playerGoals']
}): Promise<Session> {
  const season = await ensureSeasonForDate(input.playedOn)
  const periods = await db.rolePeriods.where('seasonId').equals(season.id).toArray()
  const playerIds = [...new Set(input.teams.flatMap(team => team.playerIds))]
  const now = nowIso()
  const session: Session = {
    id: id(), seasonId: season.id, playedOn: input.playedOn, status: 'completed',
    gameDurationSeconds: 180, winsPerPoint: 1, pointsToWinSet: 4,
    startedAt: null, completedAt: now, createdAt: now, updatedAt: now,
  }
  const attendance = playerIds.map(playerId => ({
    sessionId: session.id, playerId,
    roleAtSession: roleOnDate(periods, season.id, playerId, input.playedOn),
    teamCode: input.teams.find(team => team.playerIds.includes(playerId))?.code ?? null,
  }))
  const backfill: SessionBackfill = {
    sessionId: session.id, sourceKind: 'AGGREGATE', assistsRecorded: false,
    teams: input.teams, rounds: input.rounds, playerGoals: input.playerGoals.filter(row => row.goals > 0),
    createdAt: now, updatedAt: now,
  }
  await db.transaction('rw', db.sessions, db.sessionPlayers, db.sessionBackfills, async () => {
    await db.sessions.add(session)
    await db.sessionPlayers.bulkAdd(attendance)
    await db.sessionBackfills.add(backfill)
  })
  await queuedPut('sessions', session.id, session)
  for (const row of attendance) await queuedPut('session_players', `${row.sessionId}:${row.playerId}`, row)
  await queuedPut('session_backfills', session.id, backfill)
  return session
}

export type TeamDraft = { name: string; color: string; playerIds: UUID[] }

async function _createSet(sessionId: UUID, teamDrafts: TeamDraft[]): Promise<SetRecord> {
  const session = await db.sessions.get(sessionId)
  if (!session) throw new Error('Leikdagur fannst ekki')
  if (session.status === 'completed') throw new Error('Kvöldinu er lokið.')
  validateTeams(teamDrafts, (await db.sessionPlayers.where('sessionId').equals(sessionId).toArray()).map(p => p.playerId))
  const existing = await db.sets.where('sessionId').equals(sessionId).sortBy('setNo')
  if (existing.some(s => s.status !== 'completed')) throw new Error('Klára þarf núverandi sett fyrst.')
  const now = nowIso()
  const set: SetRecord = {
    id: id(), sessionId, setNo: existing.length + 1, status: 'live', winningTeamId: null,
    startedAt: now, endedAt: null, createdAt: now, updatedAt: now,
  }
  const teams: SetTeam[] = teamDrafts.map((draft, index) => ({ id: id(), setId: set.id, name: draft.name, color: draft.color, sortOrder: index }))
  const members: SetTeamMember[] = teams.flatMap((team, index) => teamDrafts[index].playerIds.map((playerId) => ({ setId: set.id, teamId: team.id, playerId })))
  let initial: Rotation = { holderTeamId: teams[0].id, challengerTeamId: teams[1].id, waitingTeamId: teams[2]?.id ?? null }
  let incumbentTeamId: UUID | null = null
  const previousSet = existing.at(-1)
  if (previousSet) {
    const previousTeams = await db.setTeams.where('setId').equals(previousSet.id).sortBy('sortOrder')
    const previousGames = await db.games.where('setId').equals(previousSet.id).sortBy('gameNo')
    const lastGame = previousGames.at(-1)
    if (lastGame?.status === 'completed') {
      const rotation = nextRotation(lastGame)
      const map = new Map(previousTeams.map((oldTeam, index) => [oldTeam.id, teams[index]?.id]))
      initial = {
        holderTeamId: map.get(rotation.holderTeamId) ?? teams[0].id,
        challengerTeamId: map.get(rotation.challengerTeamId) ?? teams[1].id,
        waitingTeamId: rotation.waitingTeamId ? map.get(rotation.waitingTeamId) ?? null : null,
      }
      incumbentTeamId = initial.waitingTeamId ? initial.holderTeamId : null
    }
  }
  const game: Game = {
    id: id(), setId: set.id, gameNo: 1, ...initial,
    incumbentTeamId,
    status: 'ready', durationSeconds: session.gameDurationSeconds,
    remainingSeconds: session.gameDurationSeconds, timerStartedAt: null, startedAt: null, endedAt: null,
    endReason: null, winningTeamId: null, exitingTeamId: null, createdAt: now, updatedAt: now,
  }
  await db.transaction('rw', db.sets, db.setTeams, db.setTeamMembers, db.games, db.sessions, async () => {
    await db.sets.add(set)
    await db.setTeams.bulkAdd(teams)
    await db.setTeamMembers.bulkAdd(members)
    await db.games.add(game)
    await db.sessions.update(sessionId, { status: 'live', startedAt: session.startedAt ?? now, updatedAt: now })
  })
  await queuedPut('sets', set.id, set)
  for (const team of teams) await queuedPut('set_teams', team.id, team)
  for (const member of members) await queuedPut('set_team_members', `${member.teamId}:${member.playerId}`, member)
  await queuedPut('games', game.id, game)
  await queuedPut('sessions', session.id, { ...session, status: 'live', startedAt: session.startedAt ?? now, updatedAt: now })
  return set
}

async function _startGame(gameId: UUID): Promise<void> {
  const game = await db.games.get(gameId)
  if (!game || game.status !== 'ready') return
  if (!(await canPlay(game))) return
  const now = nowIso()
  const updated: Game = { ...game, status: 'live', startedAt: game.startedAt ?? now, timerStartedAt: now, updatedAt: now }
  await db.games.put(updated)
  await addTimerEvent(gameId, 'START')
  await queuedPut('games', gameId, updated)
}

async function _pauseGame(gameId: UUID): Promise<void> {
  const game = await db.games.get(gameId)
  if (!game || game.status !== 'live') return
  const now = nowIso()
  const updated: Game = { ...game, status: 'paused', remainingSeconds: currentRemainingSeconds(game), timerStartedAt: null, updatedAt: now }
  await db.games.put(updated)
  await addTimerEvent(gameId, 'PAUSE')
  await queuedPut('games', gameId, updated)
}

async function _resumeGame(gameId: UUID): Promise<void> {
  const game = await db.games.get(gameId)
  if (!game || game.status !== 'paused') return
  if (!(await canPlay(game)) || game.remainingSeconds <= 0) return
  const now = nowIso()
  const updated: Game = { ...game, status: 'live', timerStartedAt: now, updatedAt: now }
  await db.games.put(updated)
  await addTimerEvent(gameId, 'RESUME')
  await queuedPut('games', gameId, updated)
}

async function _timeoutGame(gameId: UUID, outgoingTeamId?: UUID): Promise<void> {
  const game = await db.games.get(gameId)
  if (!game || !['live', 'paused'].includes(game.status)) return
  const set = await db.sets.get(game.setId)
  if (!set || (await db.sessions.get(set.sessionId))?.status !== 'live') return
  if (currentRemainingSeconds(game) > 0) throw new Error('Leiktíminn er ekki liðinn.')
  if (game.waitingTeamId && !game.incumbentTeamId && !outgoingTeamId) throw new Error('Velja þarf liðið sem fer út')
  const outgoing = game.waitingTeamId ? (game.incumbentTeamId ?? outgoingTeamId) : null
  if (outgoing && ![game.holderTeamId, game.challengerTeamId].includes(outgoing)) throw new Error('Velja þarf lið á vellinum.')
  const now = nowIso()
  const updated: Game = {
    ...game, status: 'completed', remainingSeconds: 0, timerStartedAt: null, endedAt: now,
    endReason: 'timeout', winningTeamId: null, exitingTeamId: outgoing, updatedAt: now,
  }
  await db.games.put(updated)
  const timerEventId = await addTimerEvent(gameId, 'EXPIRE')
  await db.undoActions.where('sessionId').equals(set.sessionId).delete()
  await db.undoActions.add({ id: id(), sessionId: set.sessionId, game, set, timerEventId, createdAt: now })
  await queuedPut('games', gameId, updated)
  await createNextGame(gameId)
}

async function _recordGoal(input: { gameId: UUID; teamId: UUID; scorerPlayerId: UUID; assistPlayerId?: UUID | null; eventType?: 'GOAL' | 'OWN_GOAL' }): Promise<void> {
  const game = await db.games.get(input.gameId)
  if (!game || !['live', 'paused'].includes(game.status)) return
  const set = await db.sets.get(game.setId)
  if (!set) return
  const session = await db.sessions.get(set.sessionId)
  if (!session || session.status !== 'live' || set.status === 'completed') return
  const memberships = await db.setTeamMembers.where('setId').equals(set.id).toArray()
  validateGoal(game, memberships, input)
  const eventType = input.eventType ?? 'GOAL'
  const now = nowIso()
  const remaining = currentRemainingSeconds(game)
  if (remaining <= 0) throw new Error('Leiktíminn er liðinn. Skráðu tímann í stað marks.')
  const goal: Goal = {
    id: id(), gameId: game.id, teamId: input.teamId, scorerPlayerId: input.scorerPlayerId,
    assistPlayerId: eventType === 'OWN_GOAL' ? null : input.assistPlayerId ?? null, eventType,
    secondsElapsed: Math.max(0, game.durationSeconds - remaining),
    createdAt: now, updatedAt: now, deletedAt: null,
  }
  const exiting = input.teamId === game.holderTeamId ? game.challengerTeamId : game.holderTeamId
  const completedGame: Game = {
    ...game, status: 'completed', remainingSeconds: remaining, timerStartedAt: null, endedAt: now,
    endReason: 'goal', winningTeamId: input.teamId, exitingTeamId: game.waitingTeamId ? exiting : null, updatedAt: now,
  }
  await db.transaction('rw', db.goals, db.games, db.sets, db.setTeams, db.undoActions, async () => {
    await db.undoActions.where('sessionId').equals(session.id).delete()
    await db.undoActions.add({ id: id(), sessionId: session.id, game: structuredClone(game), set: structuredClone(set), goalId: goal.id, createdAt: now })
    await db.goals.add(goal)
    await db.games.put(completedGame)
    const teams = await db.setTeams.where('setId').equals(set.id).toArray()
    const games = [...(await db.games.where('setId').equals(set.id).toArray())]
    const winner = getSetWinner(games, teams, session)
    if (winner) {
      await db.sets.update(set.id, { status: 'completed', winningTeamId: winner, endedAt: now, updatedAt: now })
    }
  })
  await queuedPut('goals', goal.id, goal)
  await queuedPut('games', game.id, completedGame)
  const refreshedSet = await db.sets.get(set.id)
  if (refreshedSet && refreshedSet.status === 'completed') await queuedPut('sets', set.id, refreshedSet)
  if (refreshedSet?.status === 'completed') {
    const teams = await db.setTeams.where('setId').equals(set.id).sortBy('sortOrder')
    await createSet(session.id, teams.map(team => ({ name: team.name, color: team.color, playerIds: memberships.filter(m => m.teamId === team.id).map(m => m.playerId) })))
  } else await createNextGame(game.id)
}

async function _createNextGame(previousGameId: UUID): Promise<Game | null> {
  const previous = await db.games.get(previousGameId)
  if (!previous || previous.status !== 'completed') return null
  const alreadyPrepared = await db.games.where('[setId+gameNo]').equals([previous.setId, previous.gameNo + 1]).first()
  if (alreadyPrepared) return alreadyPrepared
  const set = await db.sets.get(previous.setId)
  if (!set || set.status === 'completed') return null
  const session = await db.sessions.get(set.sessionId)
  if (!session) return null
  const rotation = nextRotation(previous)
  const now = nowIso()
  const game: Game = {
    id: id(), setId: previous.setId, gameNo: previous.gameNo + 1, ...rotation, status: 'ready',
    incumbentTeamId: rotation.waitingTeamId ? (previous.endReason === 'goal' ? previous.winningTeamId : rotation.holderTeamId) : null,
    durationSeconds: session.gameDurationSeconds, remainingSeconds: session.gameDurationSeconds, timerStartedAt: null,
    startedAt: null, endedAt: null, endReason: null, winningTeamId: null, exitingTeamId: null, createdAt: now, updatedAt: now,
  }
  await db.games.add(game)
  await queuedPut('games', game.id, game)
  return game
}

async function _undoLastScoringAction(sessionId: UUID): Promise<boolean> {
  const action = (await db.undoActions.where('sessionId').equals(sessionId).sortBy('createdAt')).at(-1)
  if (!action) return false
  const now = nowIso()
  if ((await db.sessions.get(sessionId))?.status === 'completed') return false
  const goal = action.goalId ? await db.goals.get(action.goalId) : undefined
  const laterSets = (await db.sets.where('sessionId').equals(sessionId).toArray()).filter(s => s.setNo > action.set.setNo)
  const laterGames = (await db.games.where('setId').equals(action.game.setId).toArray()).filter(g => g.gameNo > action.game.gameNo)
  for (const set of laterSets) laterGames.push(...await db.games.where('setId').equals(set.id).toArray())
  for (const game of laterGames) {
    await db.timerEvents.where('gameId').equals(game.id).delete()
    await queuedDelete('games', game.id)
  }
  for (const set of laterSets) {
    await db.setTeamMembers.where('setId').equals(set.id).delete()
    await db.setTeams.where('setId').equals(set.id).delete()
    await db.sets.delete(set.id)
    await queuedDelete('sets', set.id)
  }
  if (action.timerEventId) {
    await db.timerEvents.delete(action.timerEventId)
    await queuedDelete('timer_events', action.timerEventId)
  }
  const restored: Game = {
    ...action.game, status: 'paused', remainingSeconds: currentRemainingSeconds(action.game, new Date(action.createdAt).getTime()),
    timerStartedAt: null, updatedAt: now,
  }
  await db.transaction('rw', db.goals, db.games, db.sets, db.undoActions, async () => {
    if (goal) await db.goals.put({ ...goal, deletedAt: now, updatedAt: now })
    await db.games.bulkDelete(laterGames.map(g => g.id))
    await db.games.put(restored)
    await db.sets.put({ ...action.set, updatedAt: now })
    await db.undoActions.delete(action.id)
  })
  if (goal) await queuedPut('goals', goal.id, { ...goal, deletedAt: now, updatedAt: now })
  await queuedPut('games', restored.id, restored)
  await queuedPut('sets', action.set.id, { ...action.set, updatedAt: now })
  return true
}

async function _recoverRunningGames(sessionId: UUID): Promise<void> {
  const sets = await db.sets.where('sessionId').equals(sessionId).toArray()
  const games = sets.length ? await db.games.where('setId').anyOf(sets.map(s => s.id)).toArray() : []
  const now = nowIso()
  for (const game of games.filter(g => g.status === 'live')) {
    const paused = { ...game, status: 'paused' as const, remainingSeconds: currentRemainingSeconds(game), timerStartedAt: null, updatedAt: now }
    await db.games.put(paused)
    await queuedPut('games', game.id, paused)
  }
}

async function addTimerEvent(gameId: UUID, eventType: 'START' | 'PAUSE' | 'RESUME' | 'EXPIRE') {
  const event = { id: id(), gameId, eventType, occurredAt: nowIso() }
  await db.timerEvents.add(event)
  await queuedPut('timer_events', event.id, event)
  return event.id
}

async function queuedDelete(table: 'games' | 'sets' | 'timer_events', entityId: UUID) {
  await enqueueSync({ id: id(), table, entityId, operation: 'delete', payload: null, createdAt: nowIso() })
}

async function _completeSession(sessionId: UUID): Promise<void> {
  const session = await db.sessions.get(sessionId)
  if (!session || session.status === 'completed') return
  const now = nowIso()
  const sets = await db.sets.where('sessionId').equals(sessionId).toArray()
  for (const set of sets) {
    const games = await db.games.where('setId').equals(set.id).toArray()
    for (const game of games.filter(g => g.status === 'live')) await pauseGame(game.id)
    // An unfinished set retains its facts and has no awarded winner.
    if (set.status !== 'completed') {
      const ended = { ...set, endedAt: now, updatedAt: now }
      await db.sets.put(ended)
      await queuedPut('sets', set.id, ended)
    }
  }
  await db.undoActions.where('sessionId').equals(sessionId).delete()
  const updated: Session = { ...session, status: 'completed', completedAt: now, updatedAt: now }
  await db.sessions.put(updated)
  await queuedPut('sessions', sessionId, updated)
}

async function canPlay(game: Game) {
  const set = await db.sets.get(game.setId)
  return set?.status === 'live' && (await db.sessions.get(set.sessionId))?.status === 'live'
}

// Serialize each complete local command, including its outbox records.
function localAction<A extends unknown[], R>(action: (...args: A) => Promise<R>) {
  return async (...args: A): Promise<R> => {
    if (Dexie.currentTransaction) return action(...args)
    const result = await db.transaction('rw', db.tables, async () => await action(...args))
    void flushSyncQueue().catch(() => undefined)
    return result
  }
}
export const addPlayer = localAction(_addPlayer)
export const updatePlayer = localAction(_updatePlayer)
export const setPlayerRole = localAction(_setPlayerRole)
export const ensureSeasonForDate = localAction(_ensureSeasonForDate)
export const createSession = localAction(_createSession)
export const createHistoricalSession = localAction(_createHistoricalSession)
export const createSet = localAction(_createSet)
export const startGame = localAction(_startGame)
export const pauseGame = localAction(_pauseGame)
export const resumeGame = localAction(_resumeGame)
export const timeoutGame = localAction(_timeoutGame)
export const recordGoal = localAction(_recordGoal)
export const createNextGame = localAction(_createNextGame)
export const undoLastScoringAction = localAction(_undoLastScoringAction)
export const recoverRunningGames = localAction(_recoverRunningGames)
export const completeSession = localAction(_completeSession)

export const saveSeason = localAction(async (input: { id?: UUID; name: string; startsOn: string; endsOn: string }): Promise<Season> => {
  validateSeason(input)
  const existing = input.id ? await db.seasons.get(input.id) : undefined
  if (input.id && !existing) throw new Error('Önn fannst ekki.')
  const season: Season = { id: input.id ?? id(), name: input.name.trim(), startsOn: input.startsOn, endsOn: input.endsOn, isActive: existing?.isActive ?? true }
  await db.seasons.put(season)
  await queuedPut('seasons', season.id, season)
  return season
})
