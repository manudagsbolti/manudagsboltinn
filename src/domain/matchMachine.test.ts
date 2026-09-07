import { describe, expect, it } from 'vitest'
import { nextRotation } from './matchMachine'
import type { Game } from './types'

const game = (patch: Partial<Game>): Game => ({
  id: 'g1', setId: 's1', gameNo: 1, holderTeamId: 'red', challengerTeamId: 'blue', waitingTeamId: 'yellow',
  status: 'completed', durationSeconds: 180, remainingSeconds: 100, endReason: 'goal', winningTeamId: 'blue',
  exitingTeamId: 'red', createdAt: '', updatedAt: '', ...patch,
})

describe('rotation', () => {
  it('goal scorer stays in and waiting team enters', () => {
    expect(nextRotation(game({}))).toEqual({ holderTeamId: 'blue', challengerTeamId: 'yellow', waitingTeamId: 'red' })
  })
  it('holder exits on timeout', () => {
    expect(nextRotation(game({ endReason: 'timeout', winningTeamId: null, exitingTeamId: 'red', incumbentTeamId: 'red' })))
      .toEqual({ holderTeamId: 'blue', challengerTeamId: 'yellow', waitingTeamId: 'red' })
  })
  it('requires an operator choice when the first timeout has no incumbent', () => {
    expect(() => nextRotation(game({ endReason: 'timeout', winningTeamId: null, exitingTeamId: null, incumbentTeamId: null }))).toThrow()
    expect(nextRotation(game({ endReason: 'timeout', winningTeamId: null, exitingTeamId: null, incumbentTeamId: null }), 'blue'))
      .toEqual({ holderTeamId: 'red', challengerTeamId: 'yellow', waitingTeamId: 'blue' })
  })
  it('does not rotate a two-team matchup', () => {
    expect(nextRotation(game({ waitingTeamId: null, winningTeamId: 'blue' })))
      .toEqual({ holderTeamId: 'red', challengerTeamId: 'blue', waitingTeamId: null })
  })
})
