import { readFileSync } from 'node:fs'

const staging = JSON.parse(readFileSync(new URL('../data/legacy/staging.json', import.meta.url), 'utf8'))
const proposed = staging.sources.map(({ season }) => {
  const [yearText, period] = season.split(' ')
  const year = Number(yearText)
  if (!Number.isInteger(year) || !['Vor', 'Haust'].includes(period)) throw new Error(`Óþekkt önn: ${season}`)
  return {
    name: `${year} ${period} · söguleg gögn`,
    starts_on: `${year}-${period === 'Vor' ? '01-01' : '09-01'}`,
    ends_on: `${year}-${period === 'Vor' ? '04-30' : '12-31'}`,
    is_active: false,
  }
})

const snapshotPath = process.argv[2]
if (!snapshotPath) {
  console.log(JSON.stringify({ status: 'DRAFT_ONLY', reason: 'Cloud snapshot needed to check existing seasons and sessions.', proposed }, null, 2))
  process.exit(0)
}

const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8').replace(/^\uFEFF/, ''))
const tables = snapshot.tables ?? snapshot.data ?? snapshot
if (!Array.isArray(tables.seasons) || !Array.isArray(tables.sessions)) throw new Error('Snapshot must contain seasons and sessions arrays.')
const conflicts = []
const actions = []
for (const item of proposed) {
  const exact = tables.seasons.find(existing =>
    (existing.starts_on ?? existing.startsOn) === item.starts_on
    && (existing.ends_on ?? existing.endsOn) === item.ends_on)
  if (exact) {
    const sessions = tables.sessions.filter(session => (session.season_id ?? session.seasonId) === exact.id)
    actions.push({ season: item.name, action: 'REUSE', existing_id: exact.id, existing_name: exact.name, sessions: sessions.length })
    continue
  }
  actions.push({ season: item.name, action: 'CREATE_INACTIVE' })
  for (const existing of tables.seasons) {
    if (item.starts_on <= (existing.ends_on ?? existing.endsOn ?? '9999-12-31') && (existing.starts_on ?? existing.startsOn) <= item.ends_on) {
      conflicts.push(`${item.name} overlaps existing season ${existing.name} (${existing.id})`)
    }
  }
  for (const session of tables.sessions) {
    const date = session.played_on ?? session.playedOn
    if (date >= item.starts_on && date <= item.ends_on) {
      conflicts.push(`${item.name} contains existing session ${session.id} on ${date}`)
    }
  }
}
console.log(JSON.stringify({ status: conflicts.length ? 'BLOCKED' : 'CLEAR', proposed, actions, conflicts }, null, 2))
if (conflicts.length) process.exitCode = 1
