import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { buildPresentation, publishPresentation, sections } from './presentations'
import { buildSeasonAnalytics, type AnalyticsData } from './seasonAnalytics'
import type { Season, Session } from '../domain/types'
import migration from '../../supabase/migrations/018_presentations.sql?raw'

const season:Season={id:'season',name:'Haust 2026',startsOn:'2026-09-01',endsOn:'2026-12-31',isActive:true}
const session=(id:string,date:string):Session=>({id,seasonId:season.id,playedOn:date,status:'completed',gameDurationSeconds:180,winsPerPoint:1,pointsToWinSet:4,createdAt:'',updatedAt:''})
function fixture():AnalyticsData {
  return {players:['a','b','c'].map(id=>({id,name:id,isActive:true,createdAt:'',updatedAt:''})),sessions:[session('one','2026-10-26'),session('later','2026-11-02')],
    attendance:[{sessionId:'one',playerId:'a',roleAtSession:'REGULAR'},{sessionId:'one',playerId:'b',roleAtSession:'REGULAR'},{sessionId:'one',playerId:'c',roleAtSession:'SUBSTITUTE'}],sets:[],teams:[],memberships:[],games:[],goals:[],
    backfills:[{sessionId:'one',sourceKind:'AGGREGATE',assistsRecorded:false,teams:[{code:'A',name:'A',color:'red',playerIds:['a','b']},{code:'B',name:'B',color:'blue',playerIds:['c']}],rounds:[{roundNo:1,teamGoals:{A:4,B:3}},{roundNo:2,teamGoals:{A:0,B:4}}],playerGoals:[{playerId:'a',goals:4},{playerId:'b',goals:0},{playerId:'c',goals:7}],createdAt:'',updatedAt:''}]}
}
const options={title:'Miðannamat',kind:'midterm' as const,eventDate:'2026-10-29',cutoff:'2026-10-28',sections:sections.map(([key])=>key),minimumPairSets:1,discussion:'Mæting'}
describe('event publications',()=>{
  it('prevents publication of unresolved medal ties and rejects duplicate final selections',async()=>{
    const p=buildPresentation(fixture(),season,options)
    await expect(publishPresentation(p)).rejects.toThrow('úrslitaröð')
    expect(()=>buildPresentation(fixture(),season,{...options,finalTieOrder:['a','a']})).toThrow('fleiri en einu')
    const resolved=buildPresentation(fixture(),season,{...options,finalTieOrder:['b','a']})
    expect(resolved.pendingTieGroups).toBeUndefined()
    expect(resolved.slides.find(s=>s.title==='1. sæti')?.rows[0][0]).toBe('b')
  })
  it('breaks ABS ties by attendance then mini-game points and only calls out attendance below 50%',()=>{
    const data=fixture()
    data.players.push({id:'d',name:'d',isActive:true,createdAt:'',updatedAt:''})
    data.sessions=[session('one','2026-09-07'),session('two','2026-09-14'),session('three','2026-09-21')]
    data.attendance=[...['a','b','c'].map(playerId=>({sessionId:'one',playerId,roleAtSession:'REGULAR' as const})),...['b','c'].map(playerId=>({sessionId:'two',playerId,roleAtSession:'REGULAR' as const}))]
    const first=data.backfills![0]
    first.teams=[{code:'A',name:'A',color:'red',playerIds:['a','b','c']},{code:'B',name:'B',color:'blue',playerIds:['d']}]
    first.rounds=[{roundNo:1,teamGoals:{A:4,B:0}}]
    data.backfills!.push({...structuredClone(first),sessionId:'two',teams:[{code:'A',name:'A',color:'red',playerIds:['d']},{code:'B',name:'B',color:'blue',playerIds:['b']},{code:'C',name:'C',color:'green',playerIds:['c']}],rounds:[{roundNo:1,teamGoals:{A:4,B:2,C:3}}]})
    const p=buildPresentation(data,season,options)
    expect(p.pendingTieGroups).toBeUndefined()
    expect(p.slides.find(s=>s.title==='Staðan')?.rows.map(r=>r[0])).toEqual(['c','b','a'])
    expect(p.slides.filter(s=>s.story?.kind==='podium').map(s=>s.rows[0][0])).toEqual(['a','b','c'])
    expect(p.slides.find(s=>s.title==='Versta mæting')?.rows.map(r=>r[0])).toEqual(['a'])
    expect(p.slides.find(s=>s.title==='Besta mæting')?.rows).toHaveLength(3)
  })
  it('shows the same nonzero nix total in analytics, standings and award reveals',()=>{
    const data=fixture()
    data.backfills![0].rounds=[{roundNo:1,teamGoals:{A:4,B:3}},{roundNo:2,teamGoals:{A:4,B:2}}]
    data.attendance.find(a=>a.playerId==='c')!.roleAtSession='REGULAR'
    const p=buildPresentation(data,season,options)
    const a=buildSeasonAnalytics(data,season,'REGULAR',{startsOn:season.startsOn,endsOn:options.cutoff})
    expect(a.players.find(r=>r.playerId==='c')).toMatchObject({points:5,setWins:0,nixDays:1})
    const table=p.slides.find(s=>s.title==='Staðan')!
    expect(table.rows.find(r=>r[0]==='c')![table.columns.indexOf('Nix')]).toBe('1')
    expect(p.slides.find(s=>s.story?.kind==='nix')?.rows).toEqual([['c','1']])
    data.attendance.find(a=>a.playerId==='c')!.roleAtSession='SUBSTITUTE'
    expect(buildPresentation(data,season,options).slides.find(s=>s.title==='Staðan')?.rows.some(r=>r[0]==='c')).toBe(false)
    expect(buildSeasonAnalytics(data,season,'SUBSTITUTE').players.find(r=>r.playerId==='c')?.nixDays).toBe(1)
  })
  it('uses inclusive selected dates and the same points and ABS denominator as statistics',()=>{
    const data=fixture()
    data.sessions.push(session('earlier','2026-09-07'))
    data.attendance.push({sessionId:'earlier',playerId:'a',roleAtSession:'REGULAR'})
    data.backfills!.push({...structuredClone(data.backfills![0]),sessionId:'earlier'})
    data.sets.push({id:'prepared',sessionId:'one',setNo:1,status:'ready',createdAt:'',updatedAt:''})
    const p=buildPresentation(data,season,{...options,startsOn:'2026-10-26',cutoff:'2026-10-26'})
    const a=buildSeasonAnalytics(data,season,'REGULAR',{startsOn:p.startsOn!,endsOn:p.cutoff})
    expect(a.totals.sets).toBe(2)
    expect(p.source?.sessions.map(s=>s.id)).toEqual(['one'])
    expect(p.slides[0].note).toContain('2026-10-26–2026-10-26')
    const table=p.slides.find(s=>s.title==='Staðan')!
    const row=table.rows.find(r=>r[0]==='a')!
    expect(row[table.columns.indexOf('Stig')]).toBe(String(a.players.find(r=>r.playerId==='a')!.points))
    expect(row[2]).toBe(`${100*a.players[0].setWins/a.totals.sets}%`)
    expect(()=>buildPresentation(data,season,{...options,startsOn:'2026-10-29'})).toThrow()
  })
  it('freezes cutoff raw facts and derives ABS, role-separated results and aggregate pairs',()=>{
    const data=fixture(),p=buildPresentation(data,season,options)
    expect(p.source?.sessions.map(s=>s.id)).toEqual(['one'])
    const table=p.slides.find(s=>s.title==='Staðan')!
    expect(table.rows).toHaveLength(2)
    expect(table.rows[0].slice(1,4)).toEqual(['1','50%','50%'])
    expect(table.columns.slice(4,7)).toEqual(['Mörk','Assist','G+A'])
    expect(table.rows[0].slice(4,7)).toEqual(['4','0','4'])
    expect(table.notice).toContain('aðeins skráð framlag')
    expect(p.pendingTieGroups?.[0].playerIds).toEqual(['a','b'])
    const resolved=buildPresentation(data,season,{...options,finalTieOrder:['a','b']})
    expect(resolved.slides.find(s=>s.title==='1. sæti'&&s.story?.finale)?.rows).toHaveLength(1)
    expect(p.slides.find(s=>s.title==='Varamenn')?.rows[0][0]).toBe('c')
    expect(p.slides.find(s=>s.title==='Besta pörunin')?.rows[0].slice(1,4)).toEqual(['1','2','50%'])
    data.players[0].name='Changed'; data.backfills![0].rounds[0].teamGoals.A=0
    expect(p.source?.players[0].name).toBe('a')
    expect(table.rows[0][0]).toBe('a')
    expect(p.source?.backfills?.[0].rounds[0].teamGoals.A).toBe(4)
  })
  it('respects section selection, minimum sample and rejects empty/invalid periods',()=>{
    const p=buildPresentation(fixture(),season,{...options,sections:['best'],minimumPairSets:3})
    expect(p.slides.map(s=>s.title)).toEqual(['Miðannamat','Besta pörunin'])
    expect(p.slides[1].rows).toEqual([])
    expect(()=>buildPresentation(fixture(),season,{...options,cutoff:'2026-10-01'})).toThrow()
    expect(()=>buildPresentation(fixture(),season,{...options,cutoff:'2026-11-01'})).toThrow()
  })
  it('retains never pairs, defaults to twenty candidate pairs and keeps often together on one page',()=>{
    const data=fixture()
    data.players=Array.from({length:8},(_,i)=>({id:`p${i}`,name:`Player ${i}`,isActive:true,createdAt:'',updatedAt:''}))
    data.attendance=data.players.map(p=>({sessionId:'one',playerId:p.id,roleAtSession:'REGULAR'}))
    data.backfills![0].teams[0].playerIds=data.players.slice(0,4).map(p=>p.id)
    data.backfills![0].teams[1].playerIds=data.players.slice(4).map(p=>p.id)
    const p=buildPresentation(data,season,options)
    const rows=(prefix:string)=>p.slides.filter(s=>s.title.startsWith(prefix)).flatMap(s=>s.rows)
    expect(rows('Aldrei saman')).toHaveLength(16)
    expect(rows('Oftast saman')).toHaveLength(12)
    expect(rows('Besta pörunin')).toHaveLength(12)
    expect(buildPresentation(data,season,{...options,pairLimit:5}).slides.find(s=>s.title==='Besta pörunin')?.rows).toHaveLength(5)
    expect(p.slides.filter(s=>s.title.startsWith('Oftast saman'))).toHaveLength(1)
  })
  it('shows twenty voting choices with game counts, limits often pairs and includes all perfect attendance ties',()=>{
    const data=fixture()
    data.players=Array.from({length:15},(_,i)=>({id:`p${i}`,name:`Player ${i}`,isActive:true,createdAt:'',updatedAt:''}))
    data.attendance=data.players.map(p=>({sessionId:'one',playerId:p.id,roleAtSession:'REGULAR'}))
    data.backfills![0].teams[0].playerIds=data.players.slice(0,8).map(p=>p.id)
    data.backfills![0].teams[1].playerIds=data.players.slice(8).map(p=>p.id)
    const p=buildPresentation(data,season,options)
    for(const title of ['Besta pörunin','Versta pörunin','Oftast saman']){
      const slides=p.slides.filter(s=>s.title.startsWith(title))
      expect(slides).toHaveLength(1)
      expect(slides[0].rows).toHaveLength(20)
      expect(slides[0].columns).toContain('Leikir')
      expect(slides[0].rows[0][slides[0].columns.indexOf('Leikir')]).toBe('—')
    }
    expect(p.slides.find(s=>s.title==='Besta mæting')?.rows).toHaveLength(15)
  })
  it('keeps tied choke groups but assigns each podium place to a single resolved player',()=>{
    const data=fixture()
    data.players=Array.from({length:6},(_,i)=>({id:`p${i}`,name:`Player ${i}`,isActive:true,createdAt:'',updatedAt:''}))
    data.attendance=data.players.map(p=>({sessionId:'one',playerId:p.id,roleAtSession:'REGULAR'}))
    data.backfills![0].teams=([ 'A','B','C'] as const).map((code,i)=>({code,name:code,color:'red',playerIds:data.players.slice(i*2,i*2+2).map(p=>p.id)}))
    data.backfills![0].rounds=[{roundNo:1,teamGoals:{A:4,B:3,C:0}},{roundNo:2,teamGoals:{A:4,B:3,C:0}},{roundNo:3,teamGoals:{A:3,B:4,C:0}}]
    const unresolved=buildPresentation(data,season,options)
    expect(unresolved.pendingTieGroups).toHaveLength(2)
    expect(unresolved.slides.filter(s=>s.story?.kind==='podium').every(s=>s.rows.length===0)).toBe(true)
    const p=buildPresentation(data,season,{...options,finalTieOrder:['p0','p1','p2']})
    const choke=p.slides.filter(s=>s.story?.kind==='choke')
    expect(choke.map(s=>s.story?.value)).toEqual(['1 choke','2 choke'])
    expect(choke.every(s=>s.story?.phase==='reveal')).toBe(true)
    expect(choke.map(s=>s.rows.length)).toEqual([2,2])
    expect(choke.at(-1)?.rows.map(r=>r[0])).toEqual(['Player 2','Player 3'])
    const podium=p.slides.filter(s=>s.story?.kind==='podium')
    expect(podium.map(s=>s.story?.rank)).toEqual([3,2,1])
    expect(podium.map(s=>s.rows.length)).toEqual([1,1,1])
    expect(podium.map(s=>s.rows[0][0])).toEqual(['Player 2','Player 1','Player 0'])
    expect(podium).toHaveLength(3)
    const nix=p.slides.filter(s=>s.story?.kind==='nix')
    expect(nix).toHaveLength(1)
    expect(nix[0].rows.map(r=>r[0])).toEqual(['Player 4','Player 5'])
    expect(podium.at(-1)?.story?.finale).toBe(true)
    expect(podium.at(-1)?.rows.map(r=>r[0])).toEqual(['Player 0'])
    expect(p.slides.some(s=>s.title==='4. sæti')).toBe(false)
  })
  it('keeps all fifteen regulars together on the final standings slide',()=>{
    const data=fixture()
    data.players=Array.from({length:15},(_,i)=>({id:`p${i}`,name:`Player ${i}`,isActive:true,createdAt:'',updatedAt:''}))
    data.attendance=data.players.map(p=>({sessionId:'one',playerId:p.id,roleAtSession:'REGULAR'}))
    data.backfills![0].teams[0].playerIds=data.players.slice(0,8).map(p=>p.id)
    data.backfills![0].teams[1].playerIds=data.players.slice(8).map(p=>p.id)
    const p=buildPresentation(data,season,{...options,sections:['table']})
    expect(p.slides).toHaveLength(2)
    expect(p.slides[1].title).toBe('Staðan')
    expect(p.slides[1].rows).toHaveLength(15)
    expect(p.slides[1].layout).toBe('compact-table')
  })
  it('puts data-backed fun facts immediately before the last slide',()=>{
    const p=buildPresentation(fixture(),season,options)
    const wild=p.slides.at(-2)!
    expect(wild.title).toBe('Sturlaðar staðreyndir')
    expect(p.slides.at(-1)?.title).toBe('Pallborðsumræða')
    expect(wild.rows.find(row=>row[0]==='Markaverksmiðjan')?.slice(1)).toEqual(['100%','a: 4 af 4 mörkum fastamanna. Einn maður sér um þetta.'])
    expect(wild.rows.find(row=>row[0]==='Það er þröngt á toppnum')?.[1]).toBe('2 menn')
    expect(buildPresentation(fixture(),season,{...options,sections:['wild']}).slides.at(-2)?.title).toBe('Sturlaðar staðreyndir')
  })
})

describe('publication database permissions',()=>{
  let pg:PGlite
  const admin='00000000-0000-0000-0000-000000000001'
  beforeAll(async()=>{
    pg=new PGlite()
    await pg.exec(`create role anon;create role authenticated;create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.app_admins(user_id uuid primary key);insert into public.app_admins values('${admin}');
      grant usage on schema public,auth to anon,authenticated;
      alter default privileges in schema public grant all on tables to anon,authenticated;
      alter default privileges in schema public grant execute on functions to anon,authenticated;`)
    await pg.exec(migration)
  },30000)
  afterAll(async()=>{await pg?.close()})
  const call=async(role:string,user:string,sql:string,args:unknown[]=[])=>pg.transaction(async tx=>{
    await tx.exec(`set local role ${role}`)
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[user])
    return tx.query(sql,args)
  })
  it('allows admin publication and retries, rejects replacement and limits public data',async()=>{
    const p=buildPresentation(fixture(),season,options)
    const sql='select public.publish_presentation($1::jsonb)'
    await expect(call('authenticated','',sql,[JSON.stringify(p)])).rejects.toThrow()
    await call('authenticated',admin,sql,[JSON.stringify(p)])
    await call('authenticated',admin,sql,[JSON.stringify(p)])
    await expect(call('authenticated',admin,sql,[JSON.stringify({...p,title:'Overwrite'})])).rejects.toThrow()
    const result=await call('anon','','select public.get_published_presentation($1::uuid) as p',[p.id])
    expect((result.rows[0] as {p:Record<string,unknown>}).p.source).toBeUndefined()
    expect((result.rows[0] as {p:Record<string,unknown>}).p.slides).toEqual(p.slides)
    await expect(call('anon','','select * from public.presentations')).rejects.toThrow()
    await expect(call('authenticated','','select public.list_presentations()')).rejects.toThrow()
    await expect(call('anon','',sql,[JSON.stringify(p)])).rejects.toThrow()
  })
})
