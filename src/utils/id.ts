export const id = (): string => crypto.randomUUID()
export const nowIso = (): string => new Date().toISOString()
export const todayIso = (): string => {
  const date = new Date()
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10)
}
