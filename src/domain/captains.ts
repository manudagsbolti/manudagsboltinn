export function randomCaptain(playerIds: string[], random = Math.random): string {
  if (!playerIds.length) throw new Error('Lið þarf leikmenn til að velja fyrirliða.')
  return playerIds[Math.floor(random() * playerIds.length)]
}
