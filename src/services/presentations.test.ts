import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { buildPresentation, sections } from './presentations'
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
    expect(p.slides.find(s=>s.title==='1. sæti'&&s.story?.finale)?.rows).toHaveLength(2)
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
  it('retains every never/often pair across pages, while best pairs stay top five',()=>{
    const data=fixture()
    data.players=Array.from({length:8},(_,i)=>({id:`p${i}`,name:`Player ${i}`,isActive:true,createdAt:'',updatedAt:''}))
    data.attendance=data.players.map(p=>({sessionId:'one',playerId:p.id,roleAtSession:'REGULAR'}))
    data.backfills![0].teams[0].playerIds=data.players.slice(0,4).map(p=>p.id)
    data.backfills![0].teams[1].playerIds=data.players.slice(4).map(p=>p.id)
    const p=buildPresentation(data,season,options)
    const rows=(prefix:string)=>p.slides.filter(s=>s.title.startsWith(prefix)).flatMap(s=>s.rows)
    expect(rows('Aldrei saman')).toHaveLength(16)
    expect(rows('Oftast saman')).toHaveLength(12)
    expect(rows('Besta pörunin')).toHaveLength(5)
    expect(p.slides.filter(s=>s.title.startsWith('Oftast saman'))).toHaveLength(1)
  })
  it('builds ascending award reveals and bronze/silver/gold groups including all ties',()=>{
    const data=fixture()
    data.players=Array.from({length:6},(_,i)=>({id:`p${i}`,name:`Player ${i}`,isActive:true,createdAt:'',updatedAt:''}))
    data.attendance=data.players.map(p=>({sessionId:'one',playerId:p.id,roleAtSession:'REGULAR'}))
    data.backfills![0].teams=([ 'A','B','C'] as const).map((code,i)=>({code,name:code,color:'red',playerIds:data.players.slice(i*2,i*2+2).map(p=>p.id)}))
    data.backfills![0].rounds=[{roundNo:1,teamGoals:{A:4,B:3,C:0}},{roundNo:2,teamGoals:{A:4,B:3,C:0}},{roundNo:3,teamGoals:{A:3,B:4,C:0}}]
    const p=buildPresentation(data,season,options)
    const choke=p.slides.filter(s=>s.story?.kind==='choke')
    expect(choke.map(s=>s.story?.value)).toEqual(['1 choke','2 choke'])
    expect(choke.every(s=>s.story?.phase==='reveal')).toBe(true)
    expect(choke.map(s=>s.rows.length)).toEqual([2,2])
    expect(choke.at(-1)?.rows.map(r=>r[0])).toEqual(['Player 2','Player 3'])
    const podium=p.slides.filter(s=>s.story?.kind==='podium')
    expect(podium.map(s=>s.story?.rank)).toEqual([3,2,1])
    expect(podium.map(s=>s.rows.length)).toEqual([2,2,2])
    expect(podium).toHaveLength(3)
    const nix=p.slides.filter(s=>s.story?.kind==='nix')
    expect(nix).toHaveLength(1)
    expect(nix[0].rows.map(r=>r[0])).toEqual(['Player 4','Player 5'])
    expect(podium.at(-1)?.story?.finale).toBe(true)
    expect(podium.at(-1)?.rows.map(r=>r[0])).toEqual(['Player 0','Player 1'])
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
