import type { PlayerRole, PlayerRolePeriod } from './types'

export function roleAtDate(periods: PlayerRolePeriod[], seasonId: string, playerId: string, date: string): PlayerRole {
  const match = periods
    .filter((p) => p.seasonId === seasonId && p.playerId === playerId && p.validFrom <= date && (!p.validTo || p.validTo >= date))
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0]
  return match?.role ?? 'SUBSTITUTE'
}

function dayBefore(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export function setRoleFromDate(
  periods: PlayerRolePeriod[],
  seasonId: string,
  playerId: string,
  role: PlayerRole,
  effectiveDate: string,
  now = Date.now(),
): PlayerRolePeriod[] {
  const related = periods
    .filter((p) => p.seasonId === seasonId && p.playerId === playerId)
    .filter((p) => p.validFrom !== effectiveDate)
    .map((p) => {
      if (p.validFrom < effectiveDate && (!p.validTo || p.validTo >= effectiveDate)) {
        return { ...p, validTo: dayBefore(effectiveDate), updatedAt: now }
      }
      return p
    })

  const nextFuture = related.filter((p) => p.validFrom > effectiveDate).sort((a,b) => a.validFrom.localeCompare(b.validFrom))[0]
  const next: PlayerRolePeriod = {
    id: crypto.randomUUID(),
    seasonId,
    playerId,
    role,
    validFrom: effectiveDate,
    validTo: nextFuture ? dayBefore(nextFuture.validFrom) : null,
    createdAt: now,
    updatedAt: now,
  }

  const unrelated = periods.filter((p) => !(p.seasonId === seasonId && p.playerId === playerId))
  return [...unrelated, ...related, next]
}
