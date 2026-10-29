import { expect, it } from 'vitest'
import { buildSeasonAnalytics, playerGameRecord, type AnalyticsData } from './seasonAnalytics'
import { buildPresentation } from './presentations'
import type { Season } from '../domain/types'

const season:Season={id:'s',name:'Haust',startsOn:'2026-09-01',endsOn:'2026-12-31',isActive:true}
function fixture():AnalyticsData{
  return {players:['a','b','c'].map(id=>({id,name:id,isActive:true,createdAt:'',updatedAt:''})),
    sessions:[{id:'night',seasonId:'s',playedOn:'2026-09-07',status:'completed',winsPerPoint:1,pointsToWinSet:4,gameDurationSeconds:180,createdAt:'',updatedAt:''}],
    attendance:['a','b','c'].map(playerId=>({sessionId:'night',playerId,roleAtSession:'REGULAR'})),
    sets:[{id:'set',sessionId:'night',setNo:1,status:'completed',winningTeamId:'A',createdAt:'',updatedAt:''}],
    teams:['A','B','C'].map((id,sortOrder)=>({id,setId:'set',name:id,color:'red',sortOrder,captainPlayerId:id==='A'?'a':undefined})),
    memberships:['a','b','c'].map((playerId,i)=>({playerId,setId:'set',teamId:['A','B','C'][i]})),
    games:[null,'A','A','A','A'].map((winningTeamId,i)=>({id:`g${i}`,setId:'set',gameNo:i+1,holderTeamId:'A',challengerTeamId:'B',waitingTeamId:'C',status:'completed',winningTeamId,endReason:winningTeamId?'goal':'timeout',durationSeconds:180,remainingSeconds:0,startedAt:'2026-09-07T20:00:00Z',createdAt:'',updatedAt:''})),goals:[],backfills:[]}
}
it('counts draws only for on-court players and counts recorded captain sets and full-night sweeps',()=>{
  const a=buildSeasonAnalytics(fixture(),season)
  expect(a.totals.draws).toBe(1)
  expect(a.players.find(p=>p.playerId==='a')).toMatchObject({draws:1,sweeps:1,captainSets:1,smallWins:4})
  expect(a.players.find(p=>p.playerId==='b')).toMatchObject({draws:1,sweeps:0,nixDays:1})
  expect(a.players.find(p=>p.playerId==='c')?.draws).toBe(0)
  const data=fixture()
  data.sets.push({id:'unfinished',sessionId:'night',setNo:2,status:'live',createdAt:'',updatedAt:''})
  data.games.push({...data.games[0],id:'ongoing',setId:'unfinished',status:'paused',winningTeamId:null})
  expect(buildSeasonAnalytics(data,season).players.every(p=>p.sweeps===0)).toBe(true)
})
it('counts joint games including draws in pair slides and gives sweep winners a dated honour',()=>{
  const data=fixture()
  data.memberships.find(m=>m.playerId==='b')!.teamId='A'
  const p=buildPresentation(data,season,{title:'Miðannamat',kind:'midterm',eventDate:'2026-10-29',cutoff:'2026-10-29',sections:['best','sweeps','table'],minimumPairSets:1,discussion:''})
  const pair=p.slides.find(s=>s.title==='Besta pörunin')!
  expect(pair.rows[0][pair.columns.indexOf('Leikir')]).toBe('5')
  expect(pair.rows[0][pair.columns.indexOf('Unnir leikir')]).toBe('4')
  const table=p.slides.find(s=>s.title==='Staðan')!
  const row=table.rows.find(r=>r[0]==='a')!
  expect(['Spilaðir leikir','Jafntefli','Unnir leikir'].map(c=>row[table.columns.indexOf(c)])).toEqual(['5','1','4'])
  expect(p.slides.find(s=>s.title==='Sópararnir')?.rows).toEqual([['a','1','2026-09-07'],['b','1','2026-09-07']])
})
it('marks aggregate draws unknown and derives sweeps without inventing game counts',()=>{
  const data=fixture();data.sets=[];data.games=[];data.teams=[];data.memberships=[]
  data.backfills=[{sessionId:'night',sourceKind:'AGGREGATE',assistsRecorded:false,teams:[{code:'A',name:'A',color:'red',playerIds:['a']},{code:'B',name:'B',color:'blue',playerIds:['b']}],rounds:[{roundNo:1,teamGoals:{A:4,B:3}},{roundNo:2,teamGoals:{A:4,B:1}}],playerGoals:[],createdAt:'',updatedAt:''}]
  const a=buildSeasonAnalytics(data,season)
  expect(a.totals.drawsIncomplete).toBe(true)
  expect(a.players.find(p=>p.playerId==='a')).toMatchObject({sweeps:1,drawsIncomplete:true,miniGames:0})
  expect(a.players.find(p=>p.playerId==='b')).toMatchObject({sweeps:0,nixDays:1})
  expect(playerGameRecord(a.players.find(p=>p.playerId==='a')!)).toEqual({played:'Óskráð',draws:'Óskráð',wins:'8',coverage:'0 af 1'})
})
it('keeps unknown substitute games out of the regular game record',()=>{
  const data=fixture()
  data.sessions.push({...data.sessions[0],id:'legacy',playedOn:'2026-09-14'})
  data.attendance.push({sessionId:'legacy',playerId:'a',roleAtSession:'SUBSTITUTE'})
  data.backfills=[{sessionId:'legacy',sourceKind:'AGGREGATE',assistsRecorded:false,teams:[{code:'A',name:'A',color:'red',playerIds:['a']},{code:'B',name:'B',color:'blue',playerIds:['b']}],rounds:[{roundNo:1,teamGoals:{A:4,B:3}}],playerGoals:[],createdAt:'',updatedAt:''}]
  expect(playerGameRecord(buildSeasonAnalytics(data,season,'REGULAR').players.find(p=>p.playerId==='a')!)).toEqual({played:'5',draws:'1',wins:'4',coverage:'1 af 1'})
  expect(playerGameRecord(buildSeasonAnalytics(data,season,'ALL').players.find(p=>p.playerId==='a')!)).toEqual({played:'5',draws:'1',wins:'8',coverage:'1 af 2'})
})
