// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { db } from '../db/localDb'
import { addPlayer, createSession, createSet, recordGoal, startGame, pauseGame, completeSession } from './repository'
import { readGameHistory, saveGameEdit, reverseGameCorrection, type GameEdit } from './gameHistory'
import { DEFAULT_RULES } from '../domain/rules'
import { queueSubmission } from '../services/submissions'

beforeEach(async()=>{
  localStorage.clear()
  Object.defineProperty(navigator,'onLine',{value:false,configurable:true})
  await db.transaction('rw',db.tables,async()=>{for(const t of db.tables) await t.clear()})
})
async function fixture(count=3, teamCount=3) {
  const players: Awaited<ReturnType<typeof addPlayer>>[]=[]
  for(const name of ['A','B','C','D','E','F'].slice(0,teamCount*2)) players.push(await addPlayer(name))
  const session=await createSession({playedOn:'2026-09-07',playerIds:players.map(p=>p.id),...DEFAULT_RULES})
  const set=await createSet(session.id,Array.from({length:teamCount},(_,i)=>({name:`Team ${i}`,color:'blue',playerIds:players.slice(i*2,i*2+2).map(p=>p.id)})))
  const teams=await db.setTeams.where('setId').equals(set.id).sortBy('sortOrder')
  for(let i=0;i<count;i++) {
    const game=(await db.games.where('setId').equals(set.id).sortBy('gameNo')).at(-1)!
    await startGame(game.id)
    await recordGoal({gameId:game.id,teamId:teams[0].id,scorerPlayerId:players[0].id})
  }
  return {session,set,teams,players}
}
function timeout(game: Awaited<ReturnType<typeof readGameHistory>>['games'][number]):GameEdit {
  return {gameId:game.id,position:game.gameNo,holderTeamId:game.holderTeamId,challengerTeamId:game.challengerTeamId,result:'timeout',winningTeamId:'',scorerPlayerId:'',assistPlayerId:'',ownGoal:false,exitingTeamId:game.holderTeamId}
}
it('changes an older result offline, preserves later matchups and restores it from audit',async()=>{
  const {session,set}=await fixture()
  const before=await readGameHistory(set.id)
  await saveGameEdit(session.id,before,timeout(before.games[0]),'Wrong result')
  let after=await readGameHistory(set.id)
  expect(after.games.slice(1)).toEqual(before.games.slice(1))
  expect(after.games[0]).toMatchObject({endReason:'timeout',winningTeamId:null})
  expect(after.goals.filter(g=>!g.deletedAt)).toHaveLength(2)
  expect(await db.undoActions.count()).toBe(0)
  const action=(await db.sessions.get(session.id))!.gameCorrections!.at(-1)!
  await reverseGameCorrection(session.id,action.id)
  after=await readGameHistory(set.id)
  expect(after).toEqual(before)
  expect((await db.sessions.get(session.id))!.gameCorrections).toHaveLength(2)
})
it('removes a fourth win without changing the following set, and can insert the missing game back',async()=>{
  const {session,set,players,teams}=await fixture(4,2)
  const laterSet=(await db.sets.where('sessionId').equals(session.id).sortBy('setNo')).at(-1)!
  const later=await readGameHistory(laterSet.id)
  const before=await readGameHistory(set.id)
  await saveGameEdit(session.id,before,{deleteGameId:before.games[0].id},'Duplicate')
  let after=await readGameHistory(set.id)
  expect(after.set).toMatchObject({winningTeamId:null,status:'completed'})
  expect(after.games.map(g=>g.gameNo)).toEqual([1,2,3])
  expect(await readGameHistory(laterSet.id)).toEqual(later)
  await saveGameEdit(session.id,after,{...timeout(after.games[0]),gameId:undefined,position:2,result:'goal',winningTeamId:teams[0].id,scorerPlayerId:players[0].id},'Missing goal')
  after=await readGameHistory(set.id)
  expect(after.set.winningTeamId).toBe(teams[0].id)
  expect(after.games.map(g=>g.gameNo)).toEqual([1,2,3,4])
  expect(after.games[1]).toMatchObject({startedAt:null,endedAt:null})
  expect(await readGameHistory(laterSet.id)).toEqual(later)
})
it('validates own goals, stale drafts, running timers and freezes submissions atomically',async()=>{
  const {session,set,players,teams}=await fixture(1,2)
  let before=await readGameHistory(set.id)
  const goal:GameEdit={...timeout(before.games[0]),result:'goal',winningTeamId:teams[0].id,scorerPlayerId:players[2].id,ownGoal:true}
  await expect(saveGameEdit(session.id,before,{...goal,assistPlayerId:players[1].id},'Invalid')).rejects.toThrow()
  expect(await readGameHistory(set.id)).toEqual(before)
  await saveGameEdit(session.id,before,goal,'Own goal')
  await expect(saveGameEdit(session.id,before,goal,'Stale')).rejects.toThrow('breyst')
  before=await readGameHistory(set.id)
  expect(before.goals.find(g=>!g.deletedAt)).toMatchObject({eventType:'OWN_GOAL',scorerPlayerId:players[2].id,assistPlayerId:null})
  const ready=before.games.at(-1)!
  await startGame(ready.id)
  await expect(saveGameEdit(session.id,before,goal,'Running')).rejects.toThrow('pásu')
  await pauseGame(ready.id)
  const action=(await db.sessions.get(session.id))!.gameCorrections!.at(-1)!
  await expect(reverseGameCorrection(session.id,action.id)).rejects.toThrow('Ný skráning')
  await completeSession(session.id)
  await queueSubmission(session.id)
  await expect(saveGameEdit(session.id,await readGameHistory(set.id),goal,'Sent')).rejects.toThrow('sent inn')
})
it('rolls back both facts and the outbox if a correction write fails',async()=>{
  const {session,set}=await fixture(1,2)
  const before=await readGameHistory(set.id), queue=await db.syncQueue.toArray()
  const spy=vi.spyOn(db.sessions,'put').mockRejectedValueOnce(new Error('Disk failure'))
  await expect(saveGameEdit(session.id,before,timeout(before.games[0]),'Fix')).rejects.toThrow('Disk failure')
  spy.mockRestore()
  expect(await readGameHistory(set.id)).toEqual(before)
  expect(await db.syncQueue.toArray()).toEqual(queue)
})
it('closes a corrected current set and carries its prepared three-team matchup into the next set',async()=>{
  const {session,set,players,teams}=await fixture(3,3)
  const before=await readGameHistory(set.id)
  const ready=before.games.at(-1)!
  await saveGameEdit(session.id,before,{...timeout(before.games[0]),gameId:undefined,position:4,result:'goal',winningTeamId:teams[0].id,scorerPlayerId:players[0].id},'Missing fourth win')
  expect((await db.sets.get(set.id))?.winningTeamId).toBe(teams[0].id)
  expect((await db.games.get(ready.id))?.holderTeamId).toBe(ready.holderTeamId)
  const next=await createSet(session.id,teams.map((t,i)=>({name:t.name,color:t.color,playerIds:players.slice(i*2,i*2+2).map(p=>p.id)})))
  const nextTeams=await db.setTeams.where('setId').equals(next.id).sortBy('sortOrder')
  const first=(await db.games.where('setId').equals(next.id).toArray())[0]
  expect(first.status).toBe('ready')
  expect(nextTeams.find(t=>t.id===first.holderTeamId)?.sortOrder).toBe(teams.find(t=>t.id===ready.holderTeamId)?.sortOrder)
  expect(nextTeams.find(t=>t.id===first.challengerTeamId)?.sortOrder).toBe(teams.find(t=>t.id===ready.challengerTeamId)?.sortOrder)
  const audit=(await db.sessions.get(session.id))!.gameCorrections!.at(-1)!
  await expect(reverseGameCorrection(session.id,audit.id)).rejects.toThrow('Ný skráning')
})
