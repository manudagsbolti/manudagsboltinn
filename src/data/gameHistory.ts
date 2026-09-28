import { db } from '../db/localDb'
import type { Game, GameCorrection, GameHistorySnapshot, Goal, Session } from '../domain/types'
import { correctedSet, correctedSuccessor } from '../domain/gameHistory'
import { validateGoal } from '../domain/validation'
import { enqueueSync, flushSyncQueue } from '../services/syncQueue'
import { sameRows } from '../services/syncData'
import { cachedAccess, usesSubmissions } from '../services/access'
import { id, nowIso } from '../utils/id'

export interface GameEdit {
  gameId?: string
  position: number
  holderTeamId: string
  challengerTeamId: string
  result: 'goal' | 'timeout'
  winningTeamId: string
  scorerPlayerId: string
  assistPlayerId: string
  ownGoal: boolean
  assistsRecorded?: boolean
  exitingTeamId: string
}
export async function readGameHistory(setId: string): Promise<GameHistorySnapshot> {
  const set = await db.sets.get(setId)
  if (!set) throw new Error('Sett fannst ekki.')
  const games = await db.games.where('setId').equals(setId).sortBy('gameNo')
  const ids = games.map(g => g.id)
  return { set, games, goals: ids.length ? await db.goals.where('gameId').anyOf(ids).sortBy('id') : [], timerEvents: ids.length ? await db.timerEvents.where('gameId').anyOf(ids).sortBy('id') : [] }
}

async function editable(sessionId: string) {
  const session = await db.sessions.get(sessionId)
  if (!session || await db.sessionBackfills.get(sessionId)) throw new Error('Engin skráð leikjasaga fannst.')
  if (await db.submissions.get(sessionId)) throw new Error('Kvöldið hefur verið sent inn. Leiðrétting er í umsjón stjórnanda.')
  if (cachedAccess()?.role === 'recorder' && !usesSubmissions()) throw new Error('Aðgangur ekki heimill.')
  const sets = await db.sets.where('sessionId').equals(sessionId).sortBy('setNo')
  const games = await db.games.where('setId').anyOf(sets.map(s => s.id)).toArray()
  if (games.some(g => g.status === 'live')) throw new Error('Settu klukkuna í pásu áður en þú leiðréttir.')
  return { session, sets }
}
async function put(table: Parameters<typeof enqueueSync>[0]['table'], entityId: string, payload: unknown) {
  await enqueueSync({ id: id(), table, entityId, payload, operation: 'upsert', createdAt: nowIso() })
}

async function removeFollowingSet(snapshot: GameHistorySnapshot) {
  for (const game of snapshot.games) {
    await db.goals.where('gameId').equals(game.id).delete()
    await db.timerEvents.where('gameId').equals(game.id).delete()
    await db.games.delete(game.id)
  }
  await db.setTeamMembers.where('setId').equals(snapshot.set.id).delete()
  await db.setTeams.where('setId').equals(snapshot.set.id).delete()
  await db.sets.delete(snapshot.set.id)
  await enqueueSync({ id: id(), table: 'sets', entityId: snapshot.set.id, payload: null, operation: 'delete', createdAt: nowIso() })
}

async function restoreFollowingSet(change: NonNullable<GameCorrection['followingSet']>) {
  await db.sets.put(change.before.set); await put('sets', change.before.set.id, change.before.set)
  for (const team of change.teams) { await db.setTeams.put(team); await put('set_teams', team.id, team) }
  for (const member of change.members) {
    await db.setTeamMembers.put(member); await put('set_team_members', `${member.teamId}:${member.playerId}`, member)
  }
  await persist({ ...change.before, games: [], goals: [], timerEvents: [] }, change.before)
}

// Move existing rows above both number ranges before final numbering. PostgreSQL
// enforces unique(set_id,game_no) after EACH statement in the sync batch.
async function persist(before: GameHistorySnapshot, after: GameHistorySnapshot) {
  const offset = Math.max(0, ...before.games.map(g => g.gameNo), ...after.games.map(g => g.gameNo)) + 1
  for (const [i, game] of before.games.entries()) await put('games', game.id, { ...game, gameNo: offset + i })
  for (const game of before.games.filter(g => !after.games.some(a => a.id === g.id))) {
    await db.goals.where('gameId').equals(game.id).delete()
    await db.timerEvents.where('gameId').equals(game.id).delete()
    await db.games.delete(game.id)
    await enqueueSync({ id: id(), table: 'games', entityId: game.id, payload: null, operation: 'delete', createdAt: nowIso() })
  }
  for (const game of after.games) { await db.games.put(game); await put('games', game.id, game) }
  // Disable old active goals before restoring/replacing another one on a game.
  for (const goal of before.goals.filter(g => !g.deletedAt && after.games.some(a => a.id === g.gameId))) {
    const removed = { ...goal, deletedAt: nowIso(), updatedAt: nowIso() }
    await db.goals.put(removed); await put('goals', goal.id, removed)
  }
  for (const goal of after.goals) { await db.goals.put(goal); await put('goals', goal.id, goal) }
  for (const event of after.timerEvents) { await db.timerEvents.put(event); await put('timer_events', event.id, event) }
  await db.sets.put(after.set); await put('sets', after.set.id, after.set)
}

export async function saveGameEdit(sessionId: string, expected: GameHistorySnapshot, edit: GameEdit | { deleteGameId: string }, reason: string) {
  await db.transaction('rw', db.tables, async () => {
    const { session, sets } = await editable(sessionId)
    if (!reason.trim()) throw new Error('Skráðu stutta ástæðu breytingarinnar.')
    const before = await readGameHistory(expected.set.id)
    if (before.set.sessionId !== sessionId || !sameRows([before], [expected])) throw new Error('Leikjaskráin hefur breyst. Opnaðu leikinn aftur.')
    const after = structuredClone(before)
    const now = nowIso()
    let description: string
    if ('deleteGameId' in edit) {
      const game = after.games.find(g => g.id === edit.deleteGameId && g.status === 'completed')
      if (!game) throw new Error('Aðeins má fjarlægja lokinn leik.')
      description = `Fjarlægður leikur ${game.gameNo} í setti ${before.set.setNo}`
      after.games = after.games.filter(g => g.id !== game.id)
      after.goals = after.goals.filter(g => g.gameId !== game.id)
      after.timerEvents = after.timerEvents.filter(e => e.gameId !== game.id)
    } else {
      const original = edit.gameId ? after.games.find(g => g.id === edit.gameId && g.status === 'completed') : undefined
      if (edit.gameId && !original) throw new Error('Aðeins má breyta loknum leik.')
      const teams = await db.setTeams.where('setId').equals(before.set.id).toArray()
      if (edit.holderTeamId === edit.challengerTeamId || ![edit.holderTeamId, edit.challengerTeamId].every(t => teams.some(team => team.id === t))) throw new Error('Veldu tvö ólík lið úr settinu.')
      const waiting = teams.find(t => t.id !== edit.holderTeamId && t.id !== edit.challengerTeamId)?.id ?? null
      const game: Game = { ...(original ?? { id: id(), setId: before.set.id, createdAt: now, startedAt: null, endedAt: null, durationSeconds: session.gameDurationSeconds, remainingSeconds: 0 }),
        gameNo: edit.position, holderTeamId: edit.holderTeamId, challengerTeamId: edit.challengerTeamId, waitingTeamId: waiting,
        incumbentTeamId: original?.incumbentTeamId && [edit.holderTeamId, edit.challengerTeamId].includes(original.incumbentTeamId) ? original.incumbentTeamId : null,
        status: 'completed', timerStartedAt: null, endReason: edit.result, winningTeamId: edit.result === 'goal' ? edit.winningTeamId : null,
        exitingTeamId: waiting ? edit.result === 'goal' ? edit.winningTeamId === edit.holderTeamId ? edit.challengerTeamId : edit.holderTeamId : edit.exitingTeamId : null, updatedAt: now }
      if (!['goal', 'timeout'].includes(edit.result)) throw new Error('Veldu úrslit.')
      if (waiting && ![game.holderTeamId, game.challengerTeamId].includes(game.exitingTeamId!)) throw new Error('Veldu liðið sem fór út.')
      after.goals = after.goals.map(g => g.gameId === game.id && !g.deletedAt ? { ...g, deletedAt: now, updatedAt: now } : g)
      if (edit.result === 'goal') {
        validateGoal(game, await db.setTeamMembers.where('setId').equals(before.set.id).toArray(), { teamId: edit.winningTeamId, scorerPlayerId: edit.scorerPlayerId, assistPlayerId: edit.assistPlayerId || null, eventType: edit.ownGoal ? 'OWN_GOAL' : 'GOAL' })
        const old = before.goals.find(g => g.gameId === game.id && !g.deletedAt)
        const goal: Goal = { id: old?.id ?? id(), gameId: game.id, teamId: edit.winningTeamId, scorerPlayerId: edit.scorerPlayerId, assistPlayerId: edit.assistPlayerId || null, eventType: edit.ownGoal ? 'OWN_GOAL' : 'GOAL', assistsRecorded: edit.ownGoal || !!edit.assistPlayerId || edit.assistsRecorded !== false, secondsElapsed: old?.secondsElapsed ?? 0, createdAt: old?.createdAt ?? now, updatedAt: now, deletedAt: null }
        after.goals = [...after.goals.filter(g => g.id !== goal.id), goal]
      } else game.remainingSeconds = 0
      after.games = after.games.filter(g => g.id !== game.id)
      const completed = after.games.filter(g => g.status === 'completed').length
      if (!Number.isInteger(edit.position) || edit.position < 1 || edit.position > completed + 1) throw new Error('Ógild staðsetning leiks.')
      after.games.splice(edit.position - 1, 0, game)
      description = `${original ? 'Breytt' : 'Bætt við'} leik ${edit.position} í setti ${before.set.setNo}`
    }
    after.games = after.games.map((g, index) => ({ ...g, gameNo: index + 1 }))
    after.goals.sort((a,b) => a.id.localeCompare(b.id))
    const closed = sets.at(-1)?.id !== before.set.id || session.status === 'completed'
    after.set = { ...correctedSet(before.set, after.games, session, closed), updatedAt: now }
    let followingSet: GameCorrection['followingSet']
    let repairedLatest = false
    // Repair only an in-place edit of the most recently completed game.
    // Earlier edits, inserts and reordering retain the recorded chronology.
    const previous = before.games.filter(g => g.status === 'completed').at(-1)
    const corrected = previous && after.games.find(g => g.id === previous.id)
    if (session.status === 'live' && !('deleteGameId' in edit) && previous && corrected
      && edit.gameId === previous.id && edit.position === previous.gameNo) {
      const setIndex = sets.findIndex(s => s.id === before.set.id)
      const nextSet = sets[setIndex + 1]
      if (!nextSet) {
        repairedLatest = true
        after.games = after.games.map(g => g.status !== 'completed' ? correctedSuccessor(corrected, g, now) : g)
      } else if (setIndex === sets.length - 2) {
        const next = await readGameHistory(nextSet.id)
        if (next.games.length === 1 && next.games[0].status !== 'completed') {
          const teams = await db.setTeams.where('setId').equals(nextSet.id).sortBy('sortOrder')
          const members = await db.setTeamMembers.where('setId').equals(nextSet.id).toArray()
          const oldTeams = await db.setTeams.where('setId').equals(before.set.id).toArray()
          const oldMembers = await db.setTeamMembers.where('setId').equals(before.set.id).toArray()
          const mapping = new Map(oldTeams.map(team => {
            const ids = oldMembers.filter(m => m.teamId === team.id).map(m => m.playerId)
            const match = teams.find(t => {
              const other = members.filter(m => m.teamId === t.id)
              return ids.length === other.length && other.every(m => ids.includes(m.playerId))
            })
            return [team.id, match?.id]
          }))
          if (oldTeams.length === teams.length && [...mapping.values()].every(Boolean)) {
            followingSet = { before: next, after: structuredClone(next), teams, members }
            const repaired = correctedSuccessor(corrected, next.games[0], now)
            after.set = { ...correctedSet(before.set, after.games, session, false), updatedAt: now }
            if (!after.set.winningTeamId) {
              // The fourth win was mistaken: discard the unused set and resume this one.
              after.set.endedAt = null
              const gameId = id()
              after.games.push({ ...repaired, id: gameId, setId: before.set.id, gameNo: after.games.length + 1 })
              after.timerEvents.push(...next.timerEvents.map(event => ({ ...event, id: id(), gameId })))
              after.timerEvents.sort((a,b) => a.id.localeCompare(b.id))
              followingSet.after = null
              await removeFollowingSet(next)
            } else {
              followingSet.after!.games = [{ ...repaired,
                holderTeamId: mapping.get(repaired.holderTeamId)!, challengerTeamId: mapping.get(repaired.challengerTeamId)!,
                waitingTeamId: repaired.waitingTeamId ? mapping.get(repaired.waitingTeamId)! : null,
                incumbentTeamId: repaired.incumbentTeamId ? mapping.get(repaired.incumbentTeamId)! : null }]
              await persist(next, followingSet.after!)
            }
          }
        }
      }
    }
    if (!closed && !repairedLatest && after.set.winningTeamId && after.games.some(g => g.status !== 'completed' && g.startedAt)) throw new Error('Breytingin myndi ljúka settinu. Ljúktu yfirstandandi leik fyrst og opnaðu svo leiðréttinguna aftur.')
    await persist(before, after)
    await db.undoActions.where('sessionId').equals(sessionId).delete()
    const updated: Session = { ...session, updatedAt: now, gameCorrections: [...(session.gameCorrections ?? []), { id: id(), createdAt: now, reason: reason.trim(), description, lastSetId: followingSet?.after === null ? before.set.id : sets.at(-1)!.id, before, after, followingSet }] }
    await db.sessions.put(updated); await put('sessions', sessionId, updated)
  })
  void flushSyncQueue().catch(() => undefined)
}

export async function reverseGameCorrection(sessionId: string, correctionId: string) {
  await db.transaction('rw', db.tables, async () => {
    const { session, sets } = await editable(sessionId)
    const action = session.gameCorrections?.at(-1)
    if (!action || action.id !== correctionId) throw new Error('Aðeins er hægt að afturkalla nýjustu leiðréttinguna.')
    const current = await readGameHistory(action.after.set.id)
    if (sets.at(-1)?.id !== action.lastSetId || !sameRows([current], [action.after])) throw new Error('Ný skráning hefur bæst við. Leiðréttu leikinn sérstaklega til að varðveita hana.')
    const following = action.followingSet
    const expectedFollowing = following?.reversed ? following.before : following?.after
    if (expectedFollowing && !sameRows([await readGameHistory(expectedFollowing.set.id)], [expectedFollowing])) throw new Error('Ný skráning hefur bæst við. Leiðréttu leikinn sérstaklega til að varðveita hana.')
    const now = nowIso()
    // Keep newly created inactive goal rows, so the actual restored snapshot
    // remains comparable after a subsequent correction or cloud round trip.
    const restored = structuredClone(action.before)
    if (restored.set.id !== current.set.id || restored.set.sessionId !== sessionId || current.set.sessionId !== sessionId) throw new Error('Ógild breytingasaga.')
    const teams = await db.setTeams.where('setId').equals(current.set.id).toArray()
    const members = await db.setTeamMembers.where('setId').equals(current.set.id).toArray()
    if (restored.set.winningTeamId && !teams.some(t => t.id === restored.set.winningTeamId)) throw new Error('Ógild breytingasaga.')
    for (const game of restored.games) {
      const existing = await db.games.get(game.id)
      if (game.setId !== current.set.id || (existing && existing.setId !== current.set.id) || game.holderTeamId === game.challengerTeamId || [game.holderTeamId, game.challengerTeamId, game.waitingTeamId, game.winningTeamId, game.exitingTeamId, game.incumbentTeamId].some(t => t && !teams.some(team => team.id === t))) throw new Error('Ógild breytingasaga.')
    }
    for (const goal of restored.goals) {
      const game = restored.games.find(g => g.id === goal.gameId)
      const existing = await db.goals.get(goal.id)
      if (!game || (existing && existing.gameId !== goal.gameId)) throw new Error('Ógild breytingasaga.')
      if (!goal.deletedAt) validateGoal(game, members, goal)
    }
    for (const event of restored.timerEvents) {
      const existing = await db.timerEvents.get(event.id)
      if (!restored.games.some(g => g.id === event.gameId) || (existing && existing.gameId !== event.gameId)) throw new Error('Ógild breytingasaga.')
    }
    for (const goal of current.goals) if (restored.games.some(g => g.id === goal.gameId) && !restored.goals.some(g => g.id === goal.id)) restored.goals.push({ ...goal, deletedAt: now, updatedAt: now })
    restored.goals.sort((a,b) => a.id.localeCompare(b.id))
    await persist(current, restored)
    if (following) {
      if (following.reversed) {
        if (following.after) await persist(following.before, following.after)
        else await removeFollowingSet(following.before)
      } else if (following.after) await persist(following.after, following.before)
      else await restoreFollowingSet(following)
    }
    await db.undoActions.where('sessionId').equals(sessionId).delete()
    const lastSetId = following ? following.reversed && !following.after ? restored.set.id : following.before.set.id : action.lastSetId
    const updated = { ...session, updatedAt: now, gameCorrections: [...session.gameCorrections!, { id: id(), createdAt: now, reason: 'Afturköllun leiðréttingar', description: `Afturkallað: ${action.description}`, lastSetId, before: current, after: restored, followingSet: following ? { ...following, reversed: !following.reversed } : undefined, reversesId: action.id }] }
    await db.sessions.put(updated); await put('sessions', sessionId, updated)
  })
  void flushSyncQueue().catch(() => undefined)
}
