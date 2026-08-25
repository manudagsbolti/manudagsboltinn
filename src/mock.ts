import type { Player, SessionState, Team } from './types'

const regular = (id: string, name: string): Player => ({ id, name, roleAtSession: 'REGULAR' })
const substitute = (id: string, name: string): Player => ({ id, name, roleAtSession: 'SUBSTITUTE' })

const threeUnevenTeams: Team[] = [
  {
    id: 'A',
    players: [regular('p1', 'Halldór'), regular('p2', 'Eiki'), regular('p3', 'Kristó'), substitute('p4', 'Ingi Rafn')],
  },
  {
    id: 'B',
    players: [regular('p5', 'Reynir'), regular('p6', 'Ingimar'), regular('p7', 'Sæli'), substitute('p8', 'Baldur')],
  },
  {
    id: 'C',
    players: [regular('p9', 'SigSig'), regular('p10', 'Óttar'), regular('p11', 'Gunnsi'), substitute('p12', 'Jón'), regular('p13', 'Arnar')],
  },
]

const twoTeams: Team[] = [
  {
    id: 'A',
    players: [regular('t1', 'Halldór'), regular('t2', 'Eiki'), regular('t3', 'Kristó'), substitute('t4', 'Ingi Rafn')],
  },
  {
    id: 'B',
    players: [regular('t5', 'Reynir'), regular('t6', 'Ingimar'), regular('t7', 'Sæli'), substitute('t8', 'Baldur')],
  },
]

export function createMockSession(mode: 'THREE_UNEVEN' | 'TWO' = 'THREE_UNEVEN'): SessionState {
  const teams = mode === 'TWO' ? twoTeams : threeUnevenTeams
  const waitingTeam = mode === 'TWO' ? null : 'C'

  return {
    version: 1,
    sessionId: crypto.randomUUID(),
    sessionDate: new Date().toISOString().slice(0, 10),
    teams,
    raceNumber: 1,
    raceWins: { A: 0, B: 0, C: 0 },
    sessionPoints: { A: 0, B: 0, C: 0 },
    activeGame: {
      id: crypto.randomUUID(),
      sequenceNumber: 1,
      team1: 'A',
      team2: 'B',
      waitingTeam,
      incumbentTeam: null,
      status: 'READY',
      remainingMs: 180_000,
      deadlineAt: null,
      startedAt: null,
    },
    miniGames: [],
    goals: [],
    timerEvents: [],
    pointRaceWins: [],
    lastUpdatedAt: Date.now(),
  }
}
