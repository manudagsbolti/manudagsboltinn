import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/localDb'
import { supabase } from '../lib/supabase'
import { saveDiscussionEntry, syncDiscussionNotes } from '../services/discussionNotes'
import type { Presentation } from '../services/presentations'

export function DiscussionNotebook({presentation:p}:{presentation?:Presentation}) {
  const entries=useLiveQuery(()=>db.discussionNotes.orderBy('createdAt').reverse().toArray(),[])??[]
  const [topic,setTopic]=useState(''),[outcome,setOutcome]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
  const topics=[...new Set(p?.slides.filter(s=>s.title.startsWith('Pallborðsumræða')).flatMap(s=>s.rows.map(r=>r[0]))??[])]
  const rows=p?entries.filter(e=>e.presentationId===p.id):entries
  const sync=async()=>{setBusy(true);try{await syncDiscussionNotes();setMessage('Niðurstöður samstilltar.')}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
  useEffect(()=>{if(supabase)void syncDiscussionNotes().catch(e=>setMessage(e.message))},[])
  return <section className="discussion-notebook"><h2>{p?'Niðurstöður pallborðs':'Safn niðurstaðna úr pallborði'}</h2>
    {p&&<><p>{p.title} · {p.eventDate}</p><form className="card event-form" onSubmit={async e=>{e.preventDefault();setBusy(true);setMessage('');try{await saveDiscussionEntry(p,topic,outcome);setOutcome('');setMessage('Niðurstaða vistuð á þessu tæki.');if(supabase)void syncDiscussionNotes().catch(e=>setMessage(e.message))}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}}>
      <label>Umræðuefni<input list="discussion-topics" value={topic} onChange={e=>setTopic(e.target.value)} required maxLength={300}/><datalist id="discussion-topics">{topics.map(t=><option key={t} value={t}/>)}</datalist></label>
      <label>Niðurstaða / ákvörðun<textarea value={outcome} onChange={e=>setOutcome(e.target.value)} required rows={5}/></label>
      <button className="primary" disabled={busy||!topic.trim()||!outcome.trim()}>Vista niðurstöðu</button><small>Hver vistun bætir færslu við söguna. Til að leiðrétta: skráðu nýja færslu við sama umræðuefni.</small>
    </form></>}
    {supabase?<button disabled={busy} onClick={()=>void sync()}>Samstilla niðurstöður</button>:<p>Niðurstöður vistast hér á tækinu og fylgja Export backup. Skýjatenging er óvirk í þessari prófun.</p>}
    {message&&<p role="status">{message}</p>}
    {!rows.length&&<p>Engar niðurstöður skráðar enn.</p>}
    {rows.map(row=><article className="card" key={row.id}><small>{row.presentationTitle} · {row.eventDate} · {new Date(row.createdAt).toLocaleString('is-IS')}</small><h3>{row.topic}</h3><p className="discussion-outcome">{row.outcome}</p><small>{row.syncState==='synced'?'Vistað í skýinu':'Vistað á tækinu · bíður samstillingar'}</small></article>)}
  </section>
}
