import { db } from '../db/localDb'
import { nextRotation } from '../domain/matchMachine'
import { currentRemainingSeconds, getSetWinner } from '../domain/rules'
import type { Game, Goal, Player, Season, Session, SetRecord, SetTeam, SetTeamMember, UUID } from '../domain/types'
import { enqueueSync } from '../services/syncQueue'
import { seasonStartYearForDate, seasonWindow } from '../services/seasonAnalytics'
import { id, nowIso } from '../utils/id'

async function queuedPut(table: Parameters<typeof enqueueSync>[0]['table'], entityId: string, payload: unknown) {
  await enqueueSync({ id: id(), table, entityId, operation: 'upsert', payload, createdAt: nowIso() })
}

export async function addPlayer(name: string, nickname?: string): Promise<Player> {
  const now = nowIso()
  const player: Player = { id: id(), name: name.trim(), nickname: nickname?.trim() || null, isActive: true, createdAt: now, updatedAt: now }
  await db.players.add(player)
  await queuedPut('players', player.id, player)
  return player
}

export async function updatePlayer(playerId: UUID, patch: Partial<Pick<Player, 'name' | 'nickname' | 'isActive'>>): Promise<void> {
  const player = await db.players.get(playerId)
  if (!player) return
  const updated = { ...player, ...patch, updatedAt: nowIso() }
  await db.players.put(updated)
  await queuedPut('players', playerId, updated)
}

export async function ensureSeasonForDate(playedOn: string): Promise<Season> {
  const window = seasonWindow(seasonStartYearForDate(playedOn))
  const existing = (await db.seasons.toArray()).find(s => s.startsOn === window.startsOn && s.endsOn === window.endsOn)
  if (existing) return existing
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

export async function createSession(input: {
  playedOn: string
  playerIds: UUID[]
  gameDurationSeconds: number
  winsPerPoint: number
  pointsToWinSet: number
}): Promise<Session> {
  const now = nowIso()
  const season = await ensureSeasonForDate(input.playedOn)
  const session: Session = {
    id: id(), seasonId: season.id, playedOn: input.playedOn, status: 'draft', gameDurationSeconds: input.gameDurationSeconds,
    winsPerPoint: input.winsPerPoint, pointsToWinSet: input.pointsToWinSet, startedAt: null, completedAt: null,
    createdAt: now, updatedAt: now,
  }
  await db.transaction('rw', db.sessions, db.sessionPlayers, async () => {
    await db.sessions.add(session)
    await db.sessionPlayers.bulkAdd(input.playerIds.map((playerId) => ({ sessionId: session.id, playerId })))
  })
  await queuedPut('sessions', session.id, session)
  for (const playerId of input.playerIds) {
    const row = { sessionId: session.id, playerId }
    await queuedPut('session_players', `${session.id}:${playerId}`, row)
  }
  return session
}

export type TeamDraft = { name: string; color: string; playerIds: UUID[] }

export async function createSet(sessionId: UUID, teamDrafts: TeamDraft[]): Promise<SetRecord> {
  const session = await db.sessions.get(sessionId)
  if (!session) throw new Error('Leikdagur fannst ekki')
  const existing = await db.sets.where('sessionId').equals(sessionId).toArray()
  const now = nowIso()
  const set: SetRecord = {
    id: id(), sessionId, setNo: existing.length + 1, status: 'live', winningTeamId: null,
    startedAt: now, endedAt: null, createdAt: now, updatedAt: now,
  }
  const teams: SetTeam[] = teamDrafts.map((draft, index) => ({ id: id(), setId: set.id, name: draft.name, color: draft.color, sortOrder: index }))
  const members: SetTeamMember[] = teams.flatMap((team, index) => teamDrafts[index].playerIds.map((playerId) => ({ setId: set.id, teamId: team.id, playerId })))
  const game: Game = {
    id: id(), setId: set.id, gameNo: 1, holderTeamId: teams[0].id, challengerTeamId: teams[1].id,
    waitingTeamId: teams[2]?.id ?? null, status: 'ready', durationSeconds: session.gameDurationSeconds,
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

export async function startGame(gameId: UUID): Promise<void> {
  const game = await db.games.get(gameId)
  if (!game || game.status !== 'ready') return
  const now = nowIso()
  const updated: Game = { ...game, status: 'live', startedAt: game.startedAt ?? now, timerStartedAt: now, updatedAt: now }
  await db.games.put(updated)
  await queuedPut('games', gameId, updated)
}

export async function pauseGame(gameId: UUID): Promise<void> {
  const game = await db.games.get(gameId)
  if (!game || game.status !== 'live') return
  const now = nowIso()
  const updated: Game = { ...game, status: 'paused', remainingSeconds: currentRemainingSeconds(game), timerStartedAt: null, updatedAt: now }
  await db.games.put(updated)
  await queuedPut('games', gameId, updated)
}

export async function resumeGame(gameId: UUID): Promise<void> {
  const game = await db.games.get(gameId)
  if (!game || game.status !== 'paused') return
  const now = nowIso()
  const updated: Game = { ...game, status: 'live', timerStartedAt: now, updatedAt: now }
  await db.games.put(updated)
  await queuedPut('games', gameId, updated)
}

export async function timeoutGame(gameId: UUID): Promise<void> {
  const game = await db.games.get(gameId)
  if (!game || game.status === 'completed') return
  const now = nowIso()
  const updated: Game = {
    ...game, status: 'completed', remainingSeconds: 0, timerStartedAt: null, endedAt: now,
    endReason: 'timeout', winningTeamId: null, exitingTeamId: game.holderTeamId, updatedAt: now,
  }
  await db.games.put(updated)
  await queuedPut('games', gameId, updated)
}

export async function recordGoal(input: { gameId: UUID; teamId: UUID; scorerPlayerId: UUID; assistPlayerId?: UUID | null }): Promise<void> {
  const game = await db.games.get(input.gameId)
  if (!game || game.status !== 'live') return
  const set = await db.sets.get(game.setId)
  if (!set) return
  const session = await db.sessions.get(set.sessionId)
  if (!session) return
  const now = nowIso()
  const remaining = currentRemainingSeconds(game)
  const goal: Goal = {
    id: id(), gameId: game.id, teamId: input.teamId, scorerPlayerId: input.scorerPlayerId,
    assistPlayerId: input.assistPlayerId ?? null, secondsElapsed: Math.max(0, game.durationSeconds - remaining),
    createdAt: now, updatedAt: now, deletedAt: null,
  }
  const exiting = input.teamId === game.holderTeamId ? game.challengerTeamId : game.holderTeamId
  const completedGame: Game = {
    ...game, status: 'completed', remainingSeconds: remaining, timerStartedAt: null, endedAt: now,
    endReason: 'goal', winningTeamId: input.teamId, exitingTeamId: exiting, updatedAt: now,
  }
  await db.transaction('rw', db.goals, db.games, db.sets, db.setTeams, async () => {
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
}

export async function createNextGame(previousGameId: UUID): Promise<Game | null> {
  const previous = await db.games.get(previousGameId)
  if (!previous || previous.status !== 'completed') return null
  const set = await db.sets.get(previous.setId)
  if (!set || set.status === 'completed') return null
  const session = await db.sessions.get(set.sessionId)
  if (!session) return null
  const rotation = nextRotation(previous)
  const now = nowIso()
  const game: Game = {
    id: id(), setId: previous.setId, gameNo: previous.gameNo + 1, ...rotation, status: 'ready',
    durationSeconds: session.gameDurationSeconds, remainingSeconds: session.gameDurationSeconds, timerStartedAt: null,
    startedAt: null, endedAt: null, endReason: null, winningTeamId: null, exitingTeamId: null, createdAt: now, updatedAt: now,
  }
  await db.games.add(game)
  await queuedPut('games', game.id, game)
  return game
}

export async function undoGoal(gameId: UUID): Promise<void> {
  const game = await db.games.get(gameId)
  if (!game || game.endReason !== 'goal') return
  const goal = (await db.goals.where('gameId').equals(gameId).toArray()).find((g) => !g.deletedAt)
  if (!goal) return
  const set = await db.sets.get(game.setId)
  const now = nowIso()
  const updatedGoal: Goal = { ...goal, deletedAt: now, updatedAt: now }
  const reopened: Game = {
    ...game, status: 'paused', remainingSeconds: Math.max(1, game.durationSeconds - goal.secondsElapsed), timerStartedAt: null,
    endedAt: null, endReason: null, winningTeamId: null, exitingTeamId: null, updatedAt: now,
  }
  await db.transaction('rw', db.goals, db.games, db.sets, db.setTeams, async () => {
    await db.goals.put(updatedGoal)
    await db.games.put(reopened)
    if (set?.status === 'completed') await db.sets.update(set.id, { status: 'live', winningTeamId: null, endedAt: null, updatedAt: now })
  })
  await queuedPut('goals', goal.id, updatedGoal)
  await queuedPut('games', game.id, reopened)
  if (set?.status === 'completed') {
    const reopenedSet = await db.sets.get(set.id)
    if (reopenedSet) await queuedPut('sets', set.id, reopenedSet)
  }
}

export async function completeSession(sessionId: UUID): Promise<void> {
  const session = await db.sessions.get(sessionId)
  if (!session) return
  const now = nowIso()
  const updated: Session = { ...session, status: 'completed', completedAt: now, updatedAt: now }
  await db.sessions.put(updated)
  await queuedPut('sessions', sessionId, updated)
}
