import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const [backupPath, outputPath = 'data/legacy/import-plan.json'] = process.argv.slice(2)
if (!backupPath) throw new Error('Usage: node scripts/legacy-import-plan.mjs <backup.json> [output.json]')
const readJson = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''))
const backup = readJson(backupPath)
const current = backup.data ?? backup.tables ?? backup
const staging = readJson(new URL('../data/legacy/staging.json', import.meta.url))
const identity = readJson(new URL('../data/legacy/identity-map.json', import.meta.url))
const uuid = key => {
  const hex = createHash('sha256').update(`manudagsboltinn-legacy:${key}`).digest('hex').slice(0, 32).split('')
  hex[12] = '5'; hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16)
  return `${hex.slice(0,8).join('')}-${hex.slice(8,12).join('')}-${hex.slice(12,16).join('')}-${hex.slice(16,20).join('')}-${hex.slice(20).join('')}`
}
const normalize = value => value.trim().normalize('NFC').toLocaleLowerCase('is')
const existingPlayers = new Map(current.players.map(player => [normalize(player.name), player]))
const resolveName = value => identity.aliases[value] ?? value.trim()
const players = new Map(current.players.map(player => [normalize(player.name), player]))
const requiredRegularNames = [...new Set(staging.sources.flatMap(source => source.nights.flatMap(night => night.players.map(player => resolveName(player.name)))))]
for (const name of requiredRegularNames) {
  const key = normalize(name)
  if (!players.has(key)) players.set(key, { id: uuid(`player:${key}`), name, nickname: null, isActive: false, provenance: 'LEGACY_CREATED' })
}

const exactSeason = source => {
  const [year, period] = source.season.split(' ')
  const startsOn = `${year}-${period === 'Vor' ? '01-01' : '09-01'}`
  const endsOn = `${year}-${period === 'Vor' ? '04-30' : '12-31'}`
  const existing = current.seasons.find(season => season.startsOn === startsOn && season.endsOn === endsOn)
  return existing ?? { id: uuid(`season:${source.season}`), name: `${source.season} · söguleg gögn`, startsOn, endsOn, isActive: false, provenance: 'LEGACY_CREATED' }
}

const blockers = []
const seasons = []
const sessions = []
for (const source of staging.sources) {
  const season = exactSeason(source)
  seasons.push(season)
  for (const night of source.nights.filter(night => night.players.length || night.rounds.length)) {
    const label = `${source.season} ${night.sourceDate}`
    if (!night.date || new Date(`${night.date}T12:00:00Z`).getUTCDay() !== 1) blockers.push(`${label}: óstaðfest dagsetning`)
    if (!night.players.length || !night.rounds.length) blockers.push(`${label}: vantar ${!night.players.length ? 'liðsskipan' : 'umferðaúrslit'}`)
    for (const round of night.rounds) {
      if (Object.values(round.teamGoals).filter(value => value === 4).length !== 1) blockers.push(`${label}: umferð ${round.roundNo} án ótvíræðs sigurvegara`)
    }
    const teams = ['A','B','C'].map(code => ({
      code, name: `Lið ${code}`, color: { A:'#3b82f6', B:'#22c55e', C:'#a855f7' }[code],
      playerIds: night.players.filter(player => player.team === code).map(player => players.get(normalize(resolveName(player.name)))?.id),
    })).filter(team => team.playerIds.length)
    const playerGoals = night.players.map(player => ({ playerId: players.get(normalize(resolveName(player.name)))?.id, goals: player.playerGoals }))
      .filter(row => Number.isInteger(row.goals) && row.goals > 0)
    sessions.push({
      id: uuid(`session:${source.season}:${night.date ?? night.sourceDate}`), seasonId: season.id, playedOn: night.date,
      status: 'completed', teams, rounds: night.rounds, playerGoals,
      attendance: night.players.map(player => ({ playerId: players.get(normalize(resolveName(player.name)))?.id, roleAtSession: 'REGULAR', teamCode: player.team })),
      source: { fileId: source.sourceFileId, label: night.sourceDate, kind: 'AGGREGATE' },
    })
  }
  for (const guest of source.guestRows) {
    if (identity.unresolvedAliases.includes(guest.name)) blockers.push(`${source.season}: gestur „${guest.name}“ þarf fullt nafn og auðkenni`)
  }
}

for (const session of sessions) {
  const collision = current.sessions.find(existing => existing.playedOn === session.playedOn)
  if (collision) blockers.push(`${session.playedOn}: kvöld er þegar til (${collision.id})`)
}
const plan = {
  status: blockers.length ? 'BLOCKED' : 'READY', generatedAt: new Date().toISOString(), sourceBackup: backup.exportedAt ?? null,
  existingFactsPreserved: true, activeSeasonChanges: [],
  seasons: [...new Map(seasons.map(season => [season.id, season])).values()],
  players: [...players.values()], sessions, blockers: [...new Set(blockers)].sort(),
}
writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`)
console.log(JSON.stringify({ status: plan.status, seasons: plan.seasons.length, existingPlayers: existingPlayers.size,
  newInactivePlayers: plan.players.filter(player => player.provenance === 'LEGACY_CREATED').map(player => player.name),
  sessions: plan.sessions.length, blockers: plan.blockers.length, outputPath }, null, 2))
if (blockers.length) process.exitCode = 1
