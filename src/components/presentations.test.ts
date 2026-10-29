// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { db } from '../db/localDb'
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

it('adds a discussion topic inline and returns to the same slide without changing the published document',async()=>{
  ;(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true
  await db.discussionNotes.clear()
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
  const p:Presentation={id:'meeting',schemaVersion:1,title:'Fundur',seasonId:'s',kind:'midterm',eventDate:'2026-10-29',cutoff:'2026-10-28',publishedAt:'',slides:[{title:'Forsíða',columns:[],rows:[]},{title:'Pallborðsumræða',columns:['Umræðuefni'],rows:[['Fyrra efni']]}]}
  const original=JSON.stringify(p)
  const click=async(text:string)=>act(async()=>{Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.includes(text))!.click()})
  try{
    await act(async()=>root.render(createElement(PresentationViewer,{document:p,onBack:()=>{},canEditDiscussion:true})))
    await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight'})))
    await click('Pallborð —')
    await click('Bæta við umræðuefni')
    await act(async()=>{const input=host.querySelector('input')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'Nýtt umræðuefni');input.dispatchEvent(new Event('input',{bubbles:true}))})
    await act(async()=>{host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))})
    await vi.waitFor(async()=>expect(await db.discussionNotes.count()).toBe(1))
    await click('Aftur á sömu glæru')
    await vi.waitFor(async()=>{await act(async()=>{await new Promise(r=>setTimeout(r,10))});expect(host.querySelector('main')?.textContent).toContain('Nýtt umræðuefni')})
    expect(host.querySelector('h1')?.textContent).toBe('Pallborðsumræða')
    expect(JSON.stringify(p)).toBe(original)
    expect((await db.discussionNotes.toArray())[0]).toMatchObject({kind:'topic',topic:'Nýtt umræðuefni',syncState:'pending'})
  }finally{await act(async()=>root.unmount());host.remove();await db.discussionNotes.clear()}
})
