import { readFileSync } from 'node:fs'

const data = JSON.parse(readFileSync(new URL('../data/legacy/staging.json', import.meta.url), 'utf8'))
let blockers = 0
let candidateNights = 0

for (const source of data.sources) {
  const issues = []
  const seenDates = new Set()
  let previousDate = ''
  for (const night of source.nights) {
    const label = `${night.ordinal} (${night.sourceDate})`
    if (!night.players.length && !night.rounds.length) continue
    candidateNights++
    if (!night.date) issues.push(`${label}: dagsetning óstaðfest`)
    if (night.date && seenDates.has(night.date)) issues.push(`${label}: tvítekin dagsetning`)
    if (night.date && previousDate && night.date < previousDate) issues.push(`${label}: dagsetning utan raðar`)
    if (night.date && new Date(`${night.date}T12:00:00Z`).getUTCDay() !== 1) issues.push(`${label}: dagsetning er ekki mánudagur`)
    if (night.date) { seenDates.add(night.date); previousDate = night.date }
    if (!night.players.length) issues.push(`${label}: engin liðsskipan þrátt fyrir skráð úrslit`)
    if (!night.rounds.length) issues.push(`${label}: engin umferðaúrslit; núverandi backfill-líkan varðveitir ekki sigra`)
    const teams = new Set(night.players.map(player => player.team))
    if (teams.size < 2) issues.push(`${label}: færri en tvö skráð lið`)
    for (const round of night.rounds) {
      for (const [team, goals] of Object.entries(round.teamGoals)) {
        if (!Number.isInteger(goals) || goals < 0 || goals > 4) issues.push(`${label}: ógilt úrslit ${team}=${goals} í umferð ${round.roundNo}`)
      }
      const scores = Object.values(round.teamGoals)
      if (scores.length && scores.filter(score => score === 4).length !== 1) {
        issues.push(`${label}: umferð ${round.roundNo} hefur ekki einn ótvíræðan sigurvegara (${JSON.stringify(round.teamGoals)})`)
      }
    }
    for (const team of teams) {
      const players = night.players.filter(player => player.team === team)
      if (source.season === '2022 Haust') {
        const wins = [...new Set(players.map(player => player.raw[1]).filter(Boolean))]
        if (wins.length > 1) issues.push(`${label}: ósamræmdir sigrar hjá ${team}: ${wins.join('/')}`)
      } else {
        const total = night.rounds.reduce((sum, round) => sum + (round.teamGoals[team] ?? 0), 0)
        const column = source.season === '2023 Vor' ? 3 : 4
        const reported = [...new Set(players.map(player => Number(player.raw[column])).filter(Number.isFinite))]
        if (reported.length !== 1 || reported[0] !== total) issues.push(`${label}: liðsmörk ${team} í töflu stemma ekki við umferðir`)
      }
    }
  }
  if (source.guestRows.length) issues.push(`${source.guestRows.length} gestafærslur þarf að tengja við dag, lið og varanlegt auðkenni`)
  blockers += issues.length
  console.log(`${source.season}: ${source.nights.filter(n => n.players.length || n.rounds.length).length} kvöld, ${source.guestRows.length} gestafærslur, ${issues.length} atriði`)
  for (const issue of issues) console.log(`  - ${issue}`)
}

console.log(`Samtals ${candidateNights} möguleg kvöld og ${blockers} atriði til úrlausnar. Engin gögn voru skrifuð í gagnagrunn.`)
if (blockers) process.exitCode = 1
