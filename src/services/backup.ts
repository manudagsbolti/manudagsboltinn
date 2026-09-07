import { db, type SyncQueueItem } from '../db/localDb'
import { id, nowIso } from '../utils/id'

type BackupPayload = {
  kind: 'manudagsboltinn-backup'
  schemaVersion: 1
  exportedAt: string
  app: 'Mánudagsboltinn'
  data: {
    players: unknown[]
    seasons: unknown[]
    rolePeriods: unknown[]
    sessions: unknown[]
    sessionPlayers: unknown[]
    sessionBackfills: unknown[]
    sets: unknown[]
    setTeams: unknown[]
    setTeamMembers: unknown[]
    games: unknown[]
    goals: unknown[]
    timerEvents: unknown[]
  }
}

export async function exportBackup(): Promise<void> {
  const payload: BackupPayload = {
    kind: 'manudagsboltinn-backup', schemaVersion: 1, exportedAt: nowIso(), app: 'Mánudagsboltinn',
    data: {
      players: await db.players.toArray(), seasons: await db.seasons.toArray(), rolePeriods: await db.rolePeriods.toArray(), sessions: await db.sessions.toArray(),
      sessionPlayers: await db.sessionPlayers.toArray(), sessionBackfills: await db.sessionBackfills.toArray(), sets: await db.sets.toArray(), setTeams: await db.setTeams.toArray(),
      setTeamMembers: await db.setTeamMembers.toArray(), games: await db.games.toArray(), goals: await db.goals.toArray(), timerEvents: await db.timerEvents.toArray(),
    },
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = payload.exportedAt.replace(/[:.]/g,'-').slice(0,19)
  a.href = url; a.download = `manudagsboltinn-backup-${stamp}.json`; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function restoreBackup(file: File): Promise<{ sessions: number; goals: number; players: number }> {
  const raw = JSON.parse(await file.text()) as BackupPayload
  if (raw.kind !== 'manudagsboltinn-backup' || raw.schemaVersion !== 1 || !raw.data) throw new Error('Þetta lítur ekki út eins og gilt Mánudagsboltinn backup.')
  const d = raw.data as any
  await db.transaction('rw', [db.players, db.seasons, db.rolePeriods, db.sessions, db.sessionPlayers, db.sessionBackfills, db.sets, db.setTeams, db.setTeamMembers, db.games, db.goals, db.timerEvents, db.syncQueue, db.undoActions], async () => {
    await db.undoActions.clear()
    await Promise.all([db.players.clear(),db.seasons.clear(),db.rolePeriods.clear(),db.sessions.clear(),db.sessionPlayers.clear(),db.sessionBackfills.clear(),db.sets.clear(),db.setTeams.clear(),db.setTeamMembers.clear(),db.games.clear(),db.goals.clear(),db.timerEvents.clear(),db.syncQueue.clear()])
    if (d.players?.length) await db.players.bulkPut(d.players)
    if (d.seasons?.length) await db.seasons.bulkPut(d.seasons)
    if (d.rolePeriods?.length) await db.rolePeriods.bulkPut(d.rolePeriods)
    if (d.sessions?.length) await db.sessions.bulkPut(d.sessions)
    if (d.sessionPlayers?.length) await db.sessionPlayers.bulkPut(d.sessionPlayers)
    if (d.sessionBackfills?.length) await db.sessionBackfills.bulkPut(d.sessionBackfills)
    if (d.sets?.length) await db.sets.bulkPut(d.sets)
    if (d.setTeams?.length) await db.setTeams.bulkPut(d.setTeams)
    if (d.setTeamMembers?.length) await db.setTeamMembers.bulkPut(d.setTeamMembers)
    if (d.games?.length) await db.games.bulkPut(d.games)
    if (d.goals?.length) await db.goals.bulkPut(d.goals)
    if (d.timerEvents?.length) await db.timerEvents.bulkPut(d.timerEvents)
    const queue = makeQueue(d)
    if (queue.length) await db.syncQueue.bulkAdd(queue)
  })
  return { sessions: d.sessions?.length ?? 0, goals: (d.goals ?? []).filter((g:any)=>!g.deletedAt).length, players: d.players?.length ?? 0 }
}

function makeQueue(d:any): SyncQueueItem[] {
  const rows: SyncQueueItem[] = []
  const firstTimestamp = Date.now()
  const add = (table:SyncQueueItem['table'], entityId:string, payload:unknown) => rows.push({id:id(),table,entityId,operation:'upsert',payload,createdAt:new Date(firstTimestamp + rows.length).toISOString(),attempts:0,lastError:null})
  for (const x of d.players??[]) add('players',x.id,x)
  for (const x of d.seasons??[]) add('seasons',x.id,x)
  for (const x of d.rolePeriods??[]) add('player_role_periods',x.id,x)
  for (const x of d.sessions??[]) add('sessions',x.id,x)
  for (const x of d.sessionPlayers??[]) add('session_players',`${x.sessionId}:${x.playerId}`,x)
  for (const x of d.sessionBackfills??[]) add('session_backfills',x.sessionId,x)
  for (const x of d.sets??[]) add('sets',x.id,x)
  for (const x of d.setTeams??[]) add('set_teams',x.id,x)
  for (const x of d.setTeamMembers??[]) add('set_team_members',`${x.teamId}:${x.playerId}`,x)
  for (const x of d.games??[]) add('games',x.id,x)
  for (const x of d.goals??[]) add('goals',x.id,x)
  for (const x of d.timerEvents??[]) add('timer_events',x.id,x)
  return rows
}
