import { describe, expect, it } from 'vitest'
import { calculateBackfillPlayerStats, calculateSessionPlayerStats } from './stats'
import type { SessionBackfill } from '../domain/types'

describe('aggregate session backfill', () => {
  it('counts an attended night without a set win as nix despite mini-game points', () => {
    const backfill: SessionBackfill = {sessionId:'s',sourceKind:'AGGREGATE',assistsRecorded:false,
      teams:[{code:'A',name:'A',color:'red',playerIds:['winner']},{code:'B',name:'B',color:'blue',playerIds:['loser']}],
      rounds:[{roundNo:1,teamGoals:{A:4,B:3}},{roundNo:2,teamGoals:{A:4,B:2}}],playerGoals:[],createdAt:'',updatedAt:''}
    expect(calculateBackfillPlayerStats(backfill).find(p=>p.playerId==='loser')).toMatchObject({points:5,setWins:0,nixDay:true,zeroPointSets:0})
    expect(calculateBackfillPlayerStats(backfill).find(p=>p.playerId==='winner')?.nixDay).toBe(false)
    expect(calculateBackfillPlayerStats({...backfill,rounds:[]}).every(p=>!p.nixDay)).toBe(true)
    backfill.rounds.push({roundNo:3,teamGoals:{A:0,B:4}})
    expect(calculateBackfillPlayerStats(backfill).find(p=>p.playerId==='loser')?.nixDay).toBe(false)
  })
  it('uses actual played memberships for live-recorded nights, excluding attendance without play', () => {
    const input:Parameters<typeof calculateSessionPlayerStats>[0]={playerIds:['winner','loser','not-playing'],winsPerPoint:1,pointsToWinSet:4,
      sets:[{id:'set',sessionId:'s',setNo:1,status:'completed',winningTeamId:'a',createdAt:'',updatedAt:''}],
      teams:[{id:'a',setId:'set',name:'A',color:'red',sortOrder:0},{id:'b',setId:'set',name:'B',color:'blue',sortOrder:1}],
      memberships:[{setId:'set',teamId:'a',playerId:'winner'},{setId:'set',teamId:'b',playerId:'loser'}],
      games:['b','b','b','a','a','a','a'].map((winningTeamId,i)=>({id:`g${i}`,setId:'set',gameNo:i+1,holderTeamId:'a',challengerTeamId:'b',status:'completed',winningTeamId,startedAt:'2026-10-26T20:00:00Z',durationSeconds:180,remainingSeconds:0,createdAt:'',updatedAt:''})),goals:[]}
    expect(calculateSessionPlayerStats(input).find(p=>p.playerId==='loser')).toMatchObject({points:3,setWins:0,nixDay:true,chokes:1})
    expect(calculateSessionPlayerStats(input).find(p=>p.playerId==='winner')?.nixDay).toBe(false)
    expect(calculateSessionPlayerStats(input).find(p=>p.playerId==='not-playing')?.nixDay).toBe(false)
    expect(calculateSessionPlayerStats({...input,sets:[],games:[]}).every(p=>!p.nixDay)).toBe(true)
  })
  it('derives known goals and team results without inventing assists or games', () => {
    const backfill: SessionBackfill = {
      sessionId: 'session-1', sourceKind: 'AGGREGATE', assistsRecorded: false,
      teams: [
        { code: 'A', name: 'Rautt', color: '#f00', playerIds: ['p1', 'p2'] },
        { code: 'B', name: 'Blátt', color: '#00f', playerIds: ['p3', 'p4'] },
      ],
      rounds: [
        { roundNo: 1, teamGoals: { A: 4, B: 2 } },
        { roundNo: 2, teamGoals: { A: 3, B: 4 } },
      ],
      playerGoals: [{ playerId: 'p1', goals: 5 }, { playerId: 'p2', goals: 2 }, { playerId: 'p3', goals: 6 }],
      createdAt: '', updatedAt: '',
    }

    const stats = calculateBackfillPlayerStats(backfill)
    expect(stats.find(row => row.playerId === 'p1')).toMatchObject({ goals: 5, assists: 0, miniGames: 0, smallWins: 7, setWins: 1, chokes: 1 })
    expect(stats.find(row => row.playerId === 'p3')).toMatchObject({ goals: 6, smallWins: 6, setWins: 1 })
  })
})
