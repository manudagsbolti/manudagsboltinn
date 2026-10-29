export function randomCaptain(playerIds: string[], random = Math.random): string {
  if (!playerIds.length) throw new Error('Lið þarf leikmenn til að velja fyrirliða.')
  return playerIds[Math.floor(random() * playerIds.length)]
}

export function chooseRegularCaptain(playerIds: string[], regularIds: string[], previous?: string | null, random = Math.random): string | undefined {
  const eligible=playerIds.filter(id=>regularIds.includes(id))
  const fresh=eligible.filter(id=>id!==previous)
  const candidates=fresh.length?fresh:eligible
  return candidates.length?randomCaptain(candidates,random):undefined
}
