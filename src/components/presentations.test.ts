// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import { PresentationViewer } from './PresentationsScreen'
import type { Presentation } from '../services/presentations'

it('navigates a frozen deck with keys and direct selection while rendering names as text',async()=>{
  ;(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
  const p:Presentation={id:'id',schemaVersion:1,title:'Test',seasonId:'s',kind:'midterm',eventDate:'2026-10-29',cutoff:'2026-10-28',publishedAt:'2026-10-28',slides:[{title:'First',columns:[],rows:[]},{title:'Second',columns:['Player'],rows:[['<img src=x onerror=alert(1)>']]}]}
  try{
    await act(async()=>root.render(createElement(PresentationViewer,{document:p,onBack:()=>{}})))
    expect(host.querySelector('h1')?.textContent).toBe('First')
    expect(host.querySelector('a[href="#/home"]')?.textContent).toContain('Inn í kerfið')
    expect(host.querySelector('a[href="#/stats"]')?.textContent).toBe('Tölfræði')
    await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',cancelable:true})))
    expect(host.querySelector('h1')?.textContent).toBe('Second')
    expect(host.querySelector('img')).toBeNull()
    expect(host.querySelector('td')?.textContent).toContain('<img')
    await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight'})))
    expect(host.querySelector('h1')?.textContent).toBe('Second')
    await act(async()=>{const select=host.querySelector('select')!;select.value='0';select.dispatchEvent(new Event('change',{bubbles:true}))})
    expect(host.querySelector('h1')?.textContent).toBe('First')
  }finally{await act(async()=>root.unmount());host.remove()}
})
