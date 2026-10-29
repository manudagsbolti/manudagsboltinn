// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { DiscussionNotebook } from './DiscussionNotebook'
import { db } from '../db/localDb'
import type { Presentation } from '../services/presentations'

it('saves a discussion outcome and shows it in the cross-event archive after reopening',async()=>{
  ;(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true
  await db.discussionNotes.clear()
  const host=document.createElement('div');document.body.append(host)
  const root=createRoot(host)
  const p:Presentation={id:'discussion-test',title:'Lokahóf',seasonId:'s',schemaVersion:1,kind:'final',eventDate:'2026-10-29',cutoff:'2026-10-28',publishedAt:'',slides:[]}
  try{
    await act(async()=>root.render(createElement(DiscussionNotebook,{presentation:p})))
    await act(async()=>{
      const input=host.querySelector('input')!,textarea=host.querySelector('textarea')!
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'Mæting')
      input.dispatchEvent(new Event('input',{bubbles:true}))
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(textarea,'Svara fyrir sunnudagskvöld.')
      textarea.dispatchEvent(new Event('input',{bubbles:true}))
    })
    await act(async()=>{host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))})
    await vi.waitFor(async()=>expect(await db.discussionNotes.count()).toBe(1))
    await act(async()=>root.render(createElement(DiscussionNotebook,{})))
    await vi.waitFor(async()=>{
      await act(async()=>{await new Promise(resolve=>setTimeout(resolve,10))})
      expect(host.textContent).toContain('Svara fyrir sunnudagskvöld.')
      expect(host.textContent).toContain('Lokahóf')
    })
    expect(host.querySelector('textarea')).toBeNull()
  }finally{await act(async()=>root.unmount());host.remove();await db.discussionNotes.clear()}
})
