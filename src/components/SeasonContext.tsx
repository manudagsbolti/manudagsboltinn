import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/localDb'
import { defaultSeasonForDate } from '../domain/seasons'

export function displayDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('is-IS', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Administrator context only: shared recorders do not receive season ranges.
export function SeasonContext({ date, seasonId, current = false }: { date: string; seasonId?: string; current?: boolean }) {
  const seasons = useLiveQuery(() => db.seasons.toArray(), [])
  if (!seasons) return null
  const matches = seasons.filter(s => seasonId ? s.id === seasonId : s.startsOn <= date && (!s.endsOn || s.endsOn >= date)).sort((a,b) => Number(b.isActive) - Number(a.isActive))
  const saved = matches[0]
  const season = saved ?? (!current && !seasonId ? defaultSeasonForDate(date) : null)
  return <aside className="card season-context" aria-label="Tímabil annar">
    <span className="eyebrow">{current ? 'ÖNN Í GANGI' : 'ÖNN FYRIR KVÖLDIÐ'}</span>
    <strong>{season?.name ?? 'Engin önn fyrir þessa dagsetningu'}</strong>
    {season && <span>{displayDate(season.startsOn)} – {season.endsOn ? displayDate(season.endsOn) : 'engin lokadagsetning'}</span>}
    {season && !saved && <small>Sjálfgefið tímabil · ný önn verður stofnuð við vistun.</small>}
    {matches.length > 1 && <small>Fleiri en ein önn nær yfir dagsetninguna. Yfirfarðu annir áður en þú skráir.</small>}
    {!current && season && (date < season.startsOn || (season.endsOn && date > season.endsOn)) && <small role="alert">Dagsetning kvöldsins er utan valinnar annar.</small>}
    <a href="#/seasons">Skoða eða breyta önn · Annir og kvöld</a>
  </aside>
}
