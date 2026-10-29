// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { useLiveQuery } from 'dexie-react-hooks'
import { expect, it, vi } from 'vitest'
import { StatsScreen } from './StatsScreen'
import type { AnalyticsData } from '../services/seasonAnalytics'
import type { Season } from '../domain/types'

vi.mock('dexie-react-hooks',()=>({useLiveQuery:vi.fn()}))

it('shows all basic columns, defaults to ABS and exposes the attended night behind nix',async()=>{
  ;(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true
  const season:Season={id:'s',name:'Haust 2026',startsOn:'2026-09-01',endsOn:'2026-12-31',isActive:true}
  const data:AnalyticsData&{seasons:Season[]}={seasons:[season],players:['winner','loser','absent'].map(id=>({id,name:id,isActive:true,createdAt:'',updatedAt:''})),
    sessions:[{id:'night',seasonId:'s',playedOn:'2026-09-07',status:'completed',winsPerPoint:1,pointsToWinSet:4,gameDurationSeconds:180,createdAt:'',updatedAt:''}],
    attendance:[{sessionId:'night',playerId:'winner',roleAtSession:'REGULAR'},{sessionId:'night',playerId:'loser',roleAtSession:'REGULAR'}],
    sets:[],teams:[],memberships:[],games:[],goals:[],backfills:[{sessionId:'night',sourceKind:'AGGREGATE',assistsRecorded:false,
      teams:[{code:'A',name:'A',color:'red',playerIds:['winner']},{code:'B',name:'B',color:'blue',playerIds:['loser']}],
      rounds:[{roundNo:1,teamGoals:{A:4,B:3}},{roundNo:2,teamGoals:{A:4,B:2}}],playerGoals:[],createdAt:'',updatedAt:''}]}
  vi.mocked(useLiveQuery).mockReturnValue(data)
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
  try{
    await act(async()=>root.render(createElement(StatsScreen,{onPresent:()=>{}})))
    const table=host.querySelector('.statistics-overview')!
    for(const label of ['Unnin sett','Spiluð sett','ABS','ADJ','Spilaðir leikir','Jafntefli','Unnir leikir','Kvöld með leikjagögnum','Mörk','Assist','G+A','Choke','Nix','Mæting']) expect(table.querySelector('thead')!.textContent).toContain(label)
    const headers=Array.from(table.querySelectorAll('thead th')).map(c=>c.textContent)
    const winnerCells=Array.from(table.querySelectorAll('tbody tr')[0].children).map(c=>c.textContent)
    expect(headers).not.toContain('Stig')
    expect(['Spilaðir leikir','Jafntefli','Unnir leikir','Kvöld með leikjagögnum'].map(c=>winnerCells[headers.indexOf(c)])).toEqual(['Óskráð','Óskráð','8','0 af 1'])
    expect(table.querySelector('tbody tr th')!.textContent).toBe('winner')
    expect(table.querySelectorAll('tbody tr')).toHaveLength(2)
    expect(table.querySelector('tbody')!.textContent).not.toContain('absent')
    const nix=Array.from(table.querySelectorAll('thead button')).find(b=>b.textContent==='Nix')! as HTMLButtonElement
    await act(async()=>nix.click())
    expect(table.querySelector('tbody tr th')!.textContent).toBe('loser')
    await act(async()=>(table.querySelector('tbody tr th button') as HTMLButtonElement).click())
    const detail=host.querySelector('.statistics-night-details')!
    expect(detail.textContent).toContain('loser')
    expect(detail.querySelector('a')!.getAttribute('href')).toBe('#/summary/night')
    expect(Array.from(detail.querySelectorAll('tbody td')).map(c=>c.textContent)).toEqual(['5','0','2','0','0','0','1','1'])
  }finally{await act(async()=>root.unmount());host.remove();vi.mocked(useLiveQuery).mockReset()}
})
