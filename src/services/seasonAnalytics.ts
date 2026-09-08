import type { Game, Goal, Player, Season, Session, SessionBackfill, SessionPlayer, SetRecord, SetTeam, SetTeamMember, UUID } from '../domain/types'
import { buildSetTeamStats } from '../domain/rules'
import { calculateBackfillPlayerStats, calculateSessionPlayerStats } from './stats'

export interface SeasonPlayerAnalytics {
  playerId: UUID
  sessions: number
  setsPlayed: number
  setWins: number
  smallWins: number
  points: number
  goals: number
  assists: number
  contributions: number
  chokes: number
  zeroPointSets: number
  nixDays: number
  pointsPerNight: number
  pointsPerSet: number
  contributionsPerNight: number
  setWinRate: number
  chokeRate: number
  bestNightPoints: number
  bestNightGoals: number
  bestNightAssists: number
  scoringNights: number
  rating: number
}

export interface SeasonAward {
  key: string
  icon: string
  title: string
  playerId?: UUID
  value: string
  detail: string
  tone: 'gold' | 'good' | 'bad' | 'neutral'
}

export interface SeasonAnalytics {
  assistsIncomplete: boolean
  season: Season
  sessions: Session[]
  players: SeasonPlayerAnalytics[]
  awards: SeasonAward[]
  totals: {
    nights: number
    sets: number
    games: number
    goals: number
    players: number
  }
}

export type AnalyticsData = {
  players: Player[]
  sessions: Session[]
  attendance: SessionPlayer[]
  sets: SetRecord[]
  teams: SetTeam[]
  memberships: SetTeamMember[]
  games: Game[]
  goals: Goal[]
  backfills?: SessionBackfill[]
}

export function seasonStartYearForDate(dateIso: string): number {
  const [year, month] = dateIso.split('-').map(Number)
  return month >= 8 ? year : year - 1
}

export function seasonWindow(startYear: number): Season {
  const next = startYear + 1
  return {
    id: `season-${startYear}`,
    name: `${startYear}/${String(next).slice(-2)}`,
    startsOn: `${startYear}-08-01`,
    endsOn: `${next}-07-31`,
    isActive: seasonStartYearForDate(localDateIso()) === startYear,
  }
}

export function seasonYearsFromSessions(sessions: Session[]): number[] {
  const years = new Set<number>(sessions.map(s => seasonStartYearForDate(s.playedOn)))
  years.add(seasonStartYearForDate(localDateIso()))
  return [...years].sort((a,b) => b-a)
}

export function buildSeasonAnalytics(data: AnalyticsData, selection: number | Season, roleFilter: 'REGULAR' | 'SUBSTITUTE' | 'ALL' = 'REGULAR'): SeasonAnalytics {
  const season = typeof selection === 'number' ? seasonWindow(selection) : selection
  const sessions = data.sessions
    .filter(s => s.status === 'completed' && (typeof selection === 'number' ? s.playedOn >= season.startsOn && s.playedOn <= (season.endsOn ?? '9999-12-31') : s.seasonId === season.id))
    .sort((a,b) => a.playedOn.localeCompare(b.playedOn))
  const sessionIds = new Set(sessions.map(s => s.id))
  const seasonSets = data.sets.filter(s => sessionIds.has(s.sessionId))
  const setIds = new Set(seasonSets.map(s => s.id))
  const seasonTeams = data.teams.filter(t => setIds.has(t.setId))
  const seasonMemberships = data.memberships.filter(m => setIds.has(m.setId))
  const seasonGames = data.games.filter(g => setIds.has(g.setId))
  const gameIds = new Set(seasonGames.map(g => g.id))
  const seasonGoals = data.goals.filter(g => gameIds.has(g.gameId) && !g.deletedAt)

  const aggregate = new Map<UUID, SeasonPlayerAnalytics>()
  const ensure = (playerId: UUID) => {
    let row = aggregate.get(playerId)
    if (!row) {
      row = {
        playerId, sessions: 0, setsPlayed: 0, setWins: 0, smallWins: 0, points: 0, goals: 0, assists: 0,
        contributions: 0, chokes: 0, zeroPointSets: 0, nixDays: 0, pointsPerNight: 0, pointsPerSet: 0,
        contributionsPerNight: 0, setWinRate: 0, chokeRate: 0, bestNightPoints: 0, bestNightGoals: 0,
        bestNightAssists: 0, scoringNights: 0, rating: 100,
      }
      aggregate.set(playerId, row)
    }
    return row
  }

  for (const session of sessions) {
    const ids = data.attendance.filter(a => a.sessionId === session.id && (roleFilter === 'ALL' || a.roleAtSession === roleFilter)).map(a => a.playerId)
    const sets = seasonSets.filter(s => s.sessionId === session.id)
    const localSetIds = new Set(sets.map(s => s.id))
    const teams = seasonTeams.filter(t => localSetIds.has(t.setId))
    const memberships = seasonMemberships.filter(m => localSetIds.has(m.setId))
    const games = seasonGames.filter(g => localSetIds.has(g.setId))
    const localGameIds = new Set(games.map(g => g.id))
    const goals = seasonGoals.filter(g => localGameIds.has(g.gameId))
    const backfill = data.backfills?.find(item => item.sessionId === session.id)
    const stats = (backfill ? calculateBackfillPlayerStats(backfill) : calculateSessionPlayerStats({
      playerIds: ids, sets, teams, memberships, games, goals,
      winsPerPoint: session.winsPerPoint, pointsToWinSet: session.pointsToWinSet,
    })).filter(stat => ids.includes(stat.playerId))
    for (const night of stats) {
      const row = ensure(night.playerId)
      row.sessions++
      row.setsPlayed += night.setsPlayed
      row.setWins += night.setWins
      row.smallWins += night.smallWins
      row.points += night.points
      row.goals += night.goals
      row.assists += night.assists
      row.chokes += night.chokes
      row.zeroPointSets += night.zeroPointSets
      if (night.nixDay) row.nixDays++
      row.bestNightPoints = Math.max(row.bestNightPoints, night.points)
      row.bestNightGoals = Math.max(row.bestNightGoals, night.goals)
      row.bestNightAssists = Math.max(row.bestNightAssists, night.assists)
      if (night.goals > 0) row.scoringNights++
    }
  }

  const rows = [...aggregate.values()]
  for (const row of rows) {
    row.contributions = row.goals + row.assists
    row.pointsPerNight = div(row.points, row.sessions)
    row.pointsPerSet = div(row.points, row.setsPlayed)
    row.contributionsPerNight = div(row.contributions, row.sessions)
    row.setWinRate = div(row.setWins, row.setsPlayed)
    row.chokeRate = div(row.chokes, row.setWins + row.chokes)
  }
  applyRatings(rows)

  return {
    assistsIncomplete: seasonGoals.some(g => g.assistsRecorded === false) || !!data.backfills?.some(b => sessionIds.has(b.sessionId)),
    season,
    sessions,
    players: rows,
    awards: buildAwards(rows),
    totals: {
      nights: sessions.length,
      sets: seasonSets.length + (data.backfills ?? []).filter(item => sessionIds.has(item.sessionId)).reduce((sum, item) => sum + item.rounds.length, 0),
      games: seasonGames.length + (data.backfills ?? []).filter(item => sessionIds.has(item.sessionId)).reduce((sum, item) => sum + item.rounds.reduce((roundSum, round) => roundSum + Object.values(round.teamGoals).reduce((goalSum, goals) => goalSum + (goals ?? 0), 0), 0), 0),
      goals: seasonGoals.length + (data.backfills ?? []).filter(item => sessionIds.has(item.sessionId)).reduce((sum, item) => sum + item.playerGoals.reduce((goalSum, row) => goalSum + row.goals, 0), 0),
      players: rows.length,
    },
  }
}

export function playerRatingsForSeason(data: AnalyticsData, startYear: number): Map<UUID, number> {
  return new Map(buildSeasonAnalytics(data, startYear).players.map(row => [row.playerId, row.rating]))
}

export function weightedRandomAssignments(playerIds: UUID[], teamCount: number, ratings: Map<UUID, number>): Record<UUID, number> {
  if (playerIds.length === 0) return {}
  let best: Record<UUID, number> | null = null
  let bestScore = Number.POSITIVE_INFINITY
  const iterations = Math.min(3000, Math.max(600, playerIds.length * 220))
  for (let i = 0; i < iterations; i++) {
    const shuffled = shuffle(playerIds)
    const candidate = Object.fromEntries(shuffled.map((playerId, index) => [playerId, index % teamCount])) as Record<UUID, number>
    const score = assignmentImbalance(candidate, teamCount, ratings)
    if (score < bestScore) { best = candidate; bestScore = score }
    if (score < 0.75) break
  }
  return best ?? Object.fromEntries(playerIds.map((id, i) => [id, i % teamCount]))
}

export function assignmentBalance(assignments: Record<UUID, number>, teamCount: number, ratings: Map<UUID, number>): number {
  const means = Array.from({length: teamCount}, (_, team) => {
    const ids = Object.entries(assignments).filter(([,t]) => t === team).map(([id]) => id)
    return ids.length ? ids.reduce((sum,id) => sum + (ratings.get(id) ?? 100), 0) / ids.length : 100
  })
  const spread = Math.max(...means) - Math.min(...means)
  return Math.max(0, Math.round(100 - spread * 2.5))
}

function assignmentImbalance(assignments: Record<UUID, number>, teamCount: number, ratings: Map<UUID, number>): number {
  const strengths = Array.from({length: teamCount}, () => 0)
  const counts = Array.from({length: teamCount}, () => 0)
  for (const [playerId, team] of Object.entries(assignments)) {
    strengths[team] += ratings.get(playerId) ?? 100
    counts[team]++
  }
  const means = strengths.map((sum,i) => counts[i] ? sum / counts[i] : 100)
  return Math.max(...means) - Math.min(...means)
}

export function applyRatings(rows: Pick<SeasonPlayerAnalytics, 'setsPlayed' | 'pointsPerSet' | 'contributions' | 'setWinRate' | 'rating'>[]) {
  const experienced = rows.filter(r => r.setsPlayed > 0)
  if (!experienced.length) return
  const metrics: Array<(r: typeof rows[number]) => number> = [r => r.pointsPerSet, r => r.contributions / Math.max(1,r.setsPlayed), r => r.setWinRate]
  const stats = metrics.map(fn => ({ mean: mean(experienced.map(fn)), sd: stdev(experienced.map(fn)) || 1 }))
  for (const row of rows) {
    if (!row.setsPlayed) { row.rating = 100; continue }
    const z = metrics.map((fn,i) => (fn(row) - stats[i].mean) / stats[i].sd)
    const raw = 100 + z[0] * 11 + z[1] * 7 + z[2] * 8
    const confidence = Math.min(1, row.setsPlayed / 10)
    row.rating = Math.round(100 + (raw - 100) * confidence)
  }
}

function buildAwards(rows: SeasonPlayerAnalytics[]): SeasonAward[] {
  if (!rows.length) return []
  const max = (fn: (row: SeasonPlayerAnalytics) => number, minSessions = 0) => [...rows].filter(r => r.sessions >= minSessions).sort((a,b) => fn(b)-fn(a))[0]
  const awards: SeasonAward[] = []
  const add = (key:string, icon:string, title:string, row:SeasonPlayerAnalytics|undefined, value:string, detail:string, tone:SeasonAward['tone']='neutral') => {
    if (row) awards.push({ key, icon, title, playerId: row.playerId, value, detail, tone })
  }
  const points = max(r=>r.points), setWins = max(r=>r.setWins), goals=max(r=>r.goals), assists=max(r=>r.assists), contrib=max(r=>r.contributions)
  const iron=max(r=>r.sessions), efficiency=max(r=>r.pointsPerNight, Math.min(3, Math.max(...rows.map(r=>r.sessions))))
  const choke=max(r=>r.chokes), nix=max(r=>r.nixDays), zero=max(r=>r.zeroPointSets)
  const bigNight=max(r=>r.bestNightPoints), bigGoals=max(r=>r.bestNightGoals), rating=max(r=>r.rating)
  add('points','🏆','Stigakóngurinn',points,`${points?.points ?? 0} stig`,'Flest stig á tímabilinu','gold')
  add('sets','👑','Settameistarinn',setWins,`${setWins?.setWins ?? 0} sett`,'Flest unnin sett','gold')
  add('goals','⚽','Markakóngurinn',goals,`${goals?.goals ?? 0} mörk`,'Flest mörk','good')
  add('assists','🅰️','Stoðsendingakóngurinn',assists,`${assists?.assists ?? 0} stoðs.`,'Flestar stoðsendingar','good')
  add('contrib','🔥','Framlag ársins',contrib,`${contrib?.contributions ?? 0} G+A`,'Mörk + stoðsendingar','good')
  add('rating','📈','Styrkleikakóngurinn',rating,`${rating?.rating ?? 100} rating`,'Weighted-random styrkleikamat','good')
  add('iron','🦾','Járnmaðurinn',iron,`${iron?.sessions ?? 0} kvöld`,'Mesta mætingin','neutral')
  add('eff','⚡','Skilvirkastur',efficiency,`${format1(efficiency?.pointsPerNight ?? 0)} stig/kvöld`,'Meðaltal stiga á kvöldi','good')
  add('night','🌋','Kvöldsprengjan',bigNight,`${bigNight?.bestNightPoints ?? 0} stig`,'Flest stig á einu kvöldi','good')
  add('goalnight','💥','Markasprengjan',bigGoals,`${bigGoals?.bestNightGoals ?? 0} mörk`,'Flest mörk á einu kvöldi','good')
  add('choke','😵','Choke-meistarinn',choke && choke.chokes > 0 ? choke : undefined,`${choke?.chokes ?? 0} choke`,'3 stig í setti — en klárar það ekki','bad')
  add('zero','🥚','Núllkóngurinn',zero && zero.zeroPointSets > 0 ? zero : undefined,`${zero?.zeroPointSets ?? 0} 0-sett`,'Flest sett án stigs','bad')
  add('nix','☠️','Nixarinn',nix && nix.nixDays > 0 ? nix : undefined,`${nix?.nixDays ?? 0} nix`,'Flest heil kvöld án stigs','bad')
  return awards
}

const mean = (xs:number[]) => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : 0
const stdev = (xs:number[]) => { const m=mean(xs); return Math.sqrt(mean(xs.map(x=>(x-m)**2))) }
const div = (a:number,b:number) => b ? a/b : 0
const format1 = (n:number) => n.toLocaleString('is-IS',{maximumFractionDigits:1})
const shuffle = <T,>(items:T[]) => [...items].sort(()=>Math.random()-0.5)
function localDateIso() { const d=new Date(); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10) }
