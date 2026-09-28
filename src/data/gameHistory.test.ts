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

it.each([false, true])('repairs the latest-game successor, preserving its paused clock: started=%s', async(started)=>{
  const {session,set,players,teams}=await fixture(1)
  const upcoming=(await readGameHistory(set.id)).games.at(-1)!
  if(started) { await startGame(upcoming.id); await pauseGame(upcoming.id) }
  const before=await readGameHistory(set.id)
  const clock=before.games.at(-1)!
  await saveGameEdit(session.id,before,{...timeout(before.games[0]),result:'goal',winningTeamId:teams[1].id,scorerPlayerId:players[2].id},'Wrong winner')
  expect(await db.games.get(upcoming.id)).toMatchObject({holderTeamId:teams[1].id,challengerTeamId:teams[2].id,waitingTeamId:teams[0].id,incumbentTeamId:teams[1].id,status:clock.status,remainingSeconds:clock.remainingSeconds,timerStartedAt:null})
  await reverseGameCorrection(session.id,(await db.sessions.get(session.id))!.gameCorrections!.at(-1)!.id)
  expect(await readGameHistory(set.id)).toEqual(before)
})

it.each([false,true])('reopens a mistaken fourth-win set and reverses both sets: started=%s',async(started)=>{
  const {session,set,players,teams}=await fixture(4)
  const nextSet=(await db.sets.where('sessionId').equals(session.id).sortBy('setNo')).at(-1)!
  const nextGame=(await readGameHistory(nextSet.id)).games[0]
  if(started) { await startGame(nextGame.id); await pauseGame(nextGame.id) }
  const next=await readGameHistory(nextSet.id), before=await readGameHistory(set.id)
  const last=before.games.at(-1)!
  const opponent=teams.findIndex(t=>t.id===last.challengerTeamId)
  await saveGameEdit(session.id,before,{...timeout(last),result:'goal',winningTeamId:last.challengerTeamId,scorerPlayerId:players[opponent*2].id},'Wrong fourth win')
  const after=await readGameHistory(set.id)
  expect(after.set).toMatchObject({status:'live',winningTeamId:null,endedAt:null})
  expect(await db.sets.get(nextSet.id)).toBeUndefined()
  expect(after.games.at(-1)).toMatchObject({holderTeamId:last.challengerTeamId,challengerTeamId:last.waitingTeamId,waitingTeamId:last.holderTeamId,incumbentTeamId:last.challengerTeamId,status:next.games[0].status,remainingSeconds:next.games[0].remainingSeconds})
  expect(after.timerEvents.filter(e=>e.gameId===after.games.at(-1)!.id).map(e=>e.eventType).sort()).toEqual(next.timerEvents.map(e=>e.eventType).sort())
  await reverseGameCorrection(session.id,(await db.sessions.get(session.id))!.gameCorrections!.at(-1)!.id)
  expect(await readGameHistory(set.id)).toEqual(before)
  expect(await readGameHistory(nextSet.id)).toEqual(next)
  await reverseGameCorrection(session.id,(await db.sessions.get(session.id))!.gameCorrections!.at(-1)!.id)
  expect(await db.sets.get(nextSet.id)).toBeUndefined()
  expect(await readGameHistory(set.id)).toEqual(after)
})

it('leaves live play unchanged when a later game has already finished',async()=>{
  const {session,set}=await fixture(4)
  const nextSet=(await db.sets.where('sessionId').equals(session.id).sortBy('setNo')).at(-1)!
  const game=(await readGameHistory(nextSet.id)).games[0]
  const member=await db.setTeamMembers.where('teamId').equals(game.holderTeamId).first()
  await startGame(game.id)
  await recordGoal({gameId:game.id,teamId:game.holderTeamId,scorerPlayerId:member!.playerId})
  const next=await readGameHistory(nextSet.id), before=await readGameHistory(set.id)
  await saveGameEdit(session.id,before,timeout(before.games.at(-1)!),'Historical correction')
  expect(await readGameHistory(nextSet.id)).toEqual(next)
  expect((await db.sets.get(set.id))?.status).toBe('completed')
})

it('repairs the next set when the corrected winner still reaches the target and blocks stale reversal',async()=>{
  const {session,set,players,teams}=await fixture(0)
  await db.sessions.update(session.id,{pointsToWinSet:1})
  const first=(await readGameHistory(set.id)).games[0]
  await startGame(first.id)
  await recordGoal({gameId:first.id,teamId:teams[0].id,scorerPlayerId:players[0].id})
  const nextSet=(await db.sets.where('sessionId').equals(session.id).sortBy('setNo')).at(-1)!
  const nextTeams=await db.setTeams.where('setId').equals(nextSet.id).sortBy('sortOrder')
  const before=await readGameHistory(set.id)
  await saveGameEdit(session.id,before,{...timeout(before.games[0]),result:'goal',winningTeamId:teams[1].id,scorerPlayerId:players[2].id},'Wrong set winner')
  expect((await db.sets.get(set.id))?.winningTeamId).toBe(teams[1].id)
  const next=(await readGameHistory(nextSet.id)).games[0]
  expect(next).toMatchObject({holderTeamId:nextTeams[1].id,challengerTeamId:nextTeams[2].id,waitingTeamId:nextTeams[0].id,incumbentTeamId:nextTeams[1].id})
  await startGame(next.id); await pauseGame(next.id)
  await expect(reverseGameCorrection(session.id,(await db.sessions.get(session.id))!.gameCorrections!.at(-1)!.id)).rejects.toThrow('Ný skráning')
})

it('carries a paused successor into the next set when the latest correction creates a fourth win',async()=>{
  const {session,set,players,teams}=await fixture(3,2)
  let game=(await readGameHistory(set.id)).games.at(-1)!
  await startGame(game.id)
  await recordGoal({gameId:game.id,teamId:teams[1].id,scorerPlayerId:players[2].id})
  const upcoming=(await readGameHistory(set.id)).games.at(-1)!
  await startGame(upcoming.id); await pauseGame(upcoming.id)
  const before=await readGameHistory(set.id)
  game=before.games.filter(g=>g.status==='completed').at(-1)!
  await saveGameEdit(session.id,before,{...timeout(game),result:'goal',winningTeamId:teams[0].id,scorerPlayerId:players[0].id},'Missed fourth win')
  expect((await db.sets.get(set.id))?.winningTeamId).toBe(teams[0].id)
  const next=await createSet(session.id,teams.map((t,i)=>({name:t.name,color:t.color,playerIds:players.slice(i*2,i*2+2).map(p=>p.id)})))
  expect((await readGameHistory(next.id)).games[0]).toMatchObject({status:'paused',remainingSeconds:before.games.at(-1)!.remainingSeconds,timerStartedAt:null})
})
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
