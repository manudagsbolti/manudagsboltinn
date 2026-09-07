import { db } from '../db/localDb'
import { supabase } from '../lib/supabase'
import { toSnakeCase } from './syncData'
import type { SummaryData } from './sessionSummary'
import type { TimerEvent } from '../db/localDb'

export type SubmissionPayload = SummaryData & { timerEvents: TimerEvent[] }
export interface ReviewSubmission { id: string; payload: SubmissionPayload; state: 'pending' | 'approved' | 'rejected'; created_at: string }

export async function queueSubmission(sessionId: string) {
  await db.transaction('rw', db.tables, async () => {
    if (await db.submissions.get(sessionId)) return
    const session = await db.sessions.get(sessionId)
    if (!session || session.status !== 'completed') throw new Error('Ljúktu kvöldinu áður en þú sendir það.')
    const sets = await db.sets.where('sessionId').equals(sessionId).toArray()
    const setIds = sets.map(s => s.id)
    const games = await db.games.where('setId').anyOf(setIds).toArray()
    const gameIds = games.map(g => g.id)
    const attendance = await db.sessionPlayers.where('sessionId').equals(sessionId).toArray()
    const payload: SubmissionPayload = { session, sets, games, attendance,
      players: await db.players.where('id').anyOf(attendance.map(a => a.playerId)).toArray(),
      teams: await db.setTeams.where('setId').anyOf(setIds).toArray(),
      memberships: await db.setTeamMembers.where('setId').anyOf(setIds).toArray(),
      goals: await db.goals.where('gameId').anyOf(gameIds).toArray(),
      timerEvents: await db.timerEvents.where('gameId').anyOf(gameIds).toArray(),
      backfill: await db.sessionBackfills.get(sessionId),
    }
    await db.submissions.add({ sessionId, token: crypto.randomUUID(), state: 'queued', payload })
  })
}

// Caller holds the shared cloud lock. Payload is frozen when queued, so lost
// responses retry the exact same submission rather than creating another night.
export async function flushSubmissions() {
  let synced = 0, failed = 0
  for (const row of await db.submissions.toArray()) {
    const { data, error } = await supabase!.rpc('submit_night', { submission_id: row.sessionId, receipt_token: row.token, facts: toSnakeCase(row.payload) })
    if (error || !['pending', 'approved', 'rejected'].includes(data)) { if (row.state === 'queued') failed++; continue }
    await db.submissions.update(row.sessionId, { state: data })
    synced++
  }
  return { synced, failed }
}
