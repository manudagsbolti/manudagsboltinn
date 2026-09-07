import { db } from '../db/localDb'
import type { Season, PlayerRolePeriod } from '../domain/types'
import { applyRatings } from './seasonAnalytics'
import { fromSnakeCase } from './syncData'

export async function cacheRecorderRatings(raw: unknown) {
  const data = fromSnakeCase(raw) as { season: Season; rolePeriods?: PlayerRolePeriod[]; players: { playerId: string; setsPlayed: number; points: number; setWins: number; contributions: number }[] }[]
  if (!Array.isArray(data)) throw new Error('Ógilt styrkleikamat.')
  const records = data.map(({ season, players, rolePeriods }) => {
    if (!season?.id || !Array.isArray(players)) throw new Error('Ógilt styrkleikamat.')
    const rows = players.map(p => {
      if (!p.playerId || ![p.setsPlayed,p.points,p.setWins,p.contributions].every(v => Number.isFinite(Number(v)) && Number(v) >= 0)) throw new Error('Ógilt styrkleikamat.')
      const setsPlayed = Number(p.setsPlayed)
      return { playerId: p.playerId, setsPlayed, pointsPerSet: setsPlayed ? Number(p.points)/setsPlayed : 0, setWinRate: setsPlayed ? Number(p.setWins)/setsPlayed : 0, contributions: Number(p.contributions), rating: 100 }
    })
    applyRatings(rows)
    if (rolePeriods !== undefined && (!Array.isArray(rolePeriods) || rolePeriods.some(p => p.seasonId !== season.id || !p.playerId || !['REGULAR','SUBSTITUTE'].includes(p.role) || !p.validFrom))) throw new Error('Ógildar leikmannastöður.')
    return { id: season.id, season, rolePeriods, ratings: Object.fromEntries(rows.map(p => [p.playerId,p.rating])), fetchedAt: new Date().toISOString() }
  })
  await db.transaction('rw', db.ratingCache, async () => { await db.ratingCache.clear(); await db.ratingCache.bulkPut(records) })
}
