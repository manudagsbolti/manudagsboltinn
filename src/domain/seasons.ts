export function defaultSeasonForDate(date: string) {
  const [year, month] = date.split('-').map(Number)
  if (month >= 9) return { name: `${year} Haust`, startsOn: `${year}-09-01`, endsOn: `${year}-12-31` }
  if (month <= 4) return { name: `${year} Vor`, startsOn: `${year}-01-01`, endsOn: `${year}-04-30` }
  return null
}

export function validateSeason(input: { name: string; startsOn: string; endsOn?: string | null }) {
  const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date
  if (!input.name.trim() || !validDate(input.startsOn) || !input.endsOn || !validDate(input.endsOn) || input.startsOn > input.endsOn) throw new Error('Veldu nafn og gilt upphaf og lok annar.')
}
