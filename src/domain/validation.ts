import type { Game, GoalType, SetTeamMember } from './types'

export function validateTeams(teams: { playerIds: string[] }[], attendance: string[]) {
  if (![2, 3].includes(teams.length) || teams.some(t => !t.playerIds.length)) throw new Error('Veldu 2 eða 3 lið með leikmönnum.')
  const ids = teams.flatMap(t => t.playerIds)
  if (new Set(ids).size !== ids.length || ids.length !== attendance.length || attendance.some(id => !ids.includes(id))) throw new Error('Hver leikmaður þarf að vera í nákvæmlega einu liði.')
}

export function validateGoal(game: Game, members: SetTeamMember[], input: { teamId: string; scorerPlayerId: string; assistPlayerId?: string | null; eventType?: GoalType }) {
  if (![game.holderTeamId, game.challengerTeamId].includes(input.teamId)) throw new Error('Markliðið verður að vera á vellinum.')
  const defending = input.teamId === game.holderTeamId ? game.challengerTeamId : game.holderTeamId
  const teamOf = (id: string) => members.find(m => m.playerId === id)?.teamId
  const own = input.eventType === 'OWN_GOAL'
  if (teamOf(input.scorerPlayerId) !== (own ? defending : input.teamId)) throw new Error('Markaskorari er ekki í réttu liði.')
  if (input.assistPlayerId && (own || input.assistPlayerId === input.scorerPlayerId || teamOf(input.assistPlayerId) !== input.teamId)) throw new Error('Ógild stoðsending.')
}
