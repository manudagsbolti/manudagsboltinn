import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/localDb'
import { deckStyles, renderSlide } from '../services/presentationDesign'
import { DiscussionNotebook } from './DiscussionNotebook'
import { buildPresentation, downloadPresentation, fetchPublished, publishPresentation, readPresentationData, refreshPresentations, sections, type Presentation, type SectionKey } from '../services/presentations'

export function PresentationViewer({document:p,onBack,onDiscussion}:{document:Presentation;onBack:()=>void;onDiscussion?:()=>void}){
  const [index,setIndex]=useState(0)
  const [error,setError]=useState('')
  const move=(delta:number)=>setIndex(i=>Math.max(0,Math.min(p.slides.length-1,i+delta)))
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.target instanceof Element && (e.target.closest('select,input,textarea') || (e.key===' ' && e.target.closest('button,a,summary'))))return;if(['ArrowRight',' ','PageDown'].includes(e.key)){e.preventDefault();move(1)}if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();move(-1)}if(e.key==='Escape')onBack()};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[p.slides.length,onBack])
  const slide=p.slides[index]??p.slides[0]
  return <section className="event-presentation"><style>{deckStyles}</style><header className="deck-toolbar"><a href="#/home">↗ Inn í kerfið</a><a href="#/stats">Tölfræði</a><button onClick={onBack}>← Loka kynningu</button>{onDiscussion&&<button onClick={onDiscussion}>✎ Skrá niðurstöður pallborðs</button>}<span>{p.title} · {p.eventDate}</span><button onClick={()=>{void downloadPresentation(p).catch(()=>setError('HTML niðurhal mistókst. Reyndu aftur.'))}}>↓ HTML</button><button onClick={()=>{void document.documentElement.requestFullscreen?.().catch(()=>setError('Ekki tókst að opna allan skjáinn.'))}}>⛶ Allur skjár</button></header>
    {error&&<p role="alert">{error}</p>}<main key={index} className="deck-stage" dangerouslySetInnerHTML={{__html:renderSlide(slide,index)}}/>
    <footer className="deck-controls"><div className="deck-progress" style={{width:`${(index+1)/p.slides.length*100}%`}}/><button disabled={index===0} onClick={()=>move(-1)}>← Fyrri</button><label><select aria-label="Velja glæru" value={index} onChange={e=>setIndex(Number(e.target.value))}>{p.slides.map((s,i)=><option key={i} value={i}>{i+1}. {s.title}</option>)}</select></label><span className="deck-counter">{String(index+1).padStart(2,'0')} / {String(p.slides.length).padStart(2,'0')}</span><button disabled={index===p.slides.length-1} onClick={()=>move(1)}>Næsta →</button></footer></section>
}

export function PublishedPresentation({id}:{id:string}){
  const [p,setP]=useState<Presentation|null>(null),[error,setError]=useState('')
  useEffect(()=>{let active=true;setP(null);setError('');void fetchPublished(id).then(p=>{if(active){setP(p);if(!p)setError('Kynning fannst ekki eða hefur ekki verið gefin út.')}}).catch(e=>{if(active)setError(String(e.message))});return()=>{active=false}},[id])
  return p?<PresentationViewer key={id} document={p} onBack={()=>{location.hash='#/events'}}/>:<section className="screen"><p role="status">{error||'Sæki kynningu…'}</p><a href="#/events">Til baka</a></section>
}

export function PresentationsScreen(){
  const data=useLiveQuery(readPresentationData,[])
  const archive=useLiveQuery(()=>db.presentations.orderBy('eventDate').reverse().toArray(),[])
  const [seasonId,setSeasonId]=useState(''),[kind,setKind]=useState<Presentation['kind']>('midterm')
  const [startDate,setStartDate]=useState('')
  const [eventDate,setEventDate]=useState(new Date().toISOString().slice(0,10)),[cutoff,setCutoff]=useState(new Date().toISOString().slice(0,10))
  const [title,setTitle]=useState('Miðannamat'),[selected,setSelected]=useState<SectionKey[]>(sections.filter(([k])=>k!=='extra').map(([k])=>k))
  const [minimum,setMinimum]=useState(3),[discussion,setDiscussion]=useState('Mætingin\nFramhaldið')
  const [preview,setPreview]=useState<Presentation|null>(null),[view,setView]=useState<Presentation|null>(null)
  const [notesFor,setNotesFor]=useState<Presentation|null>(null)
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
  const download = (p:Presentation) => { void downloadPresentation(p).catch(() => setError('HTML niðurhal mistókst. Reyndu aftur.')) }
  useEffect(()=>{void refreshPresentations().catch(e=>setError(e.message))},[])
  const season=data?.seasons.find(s=>s.id===seasonId)??data?.seasons[0]
  const startsOn=startDate||season?.startsOn||''
  const included=data?.sessions.filter(s=>s.seasonId===season?.id&&s.status==='completed'&&s.playedOn>=startsOn&&s.playedOn<=cutoff).sort((a,b)=>a.playedOn.localeCompare(b.playedOn))??[]
  const invalidate=()=>{setPreview(null);setMessage('')}
  if(notesFor)return <section className="screen page-screen event-editor"><button onClick={()=>setNotesFor(null)}>← Til baka</button><DiscussionNotebook presentation={notesFor}/></section>
  if(view)return <PresentationViewer key={view.id} document={view} onBack={()=>setView(null)} onDiscussion={()=>setNotesFor(view)}/>
  return <section className="screen page-screen event-editor"><div className="event-actions"><a href="#/home">← Inn í kerfið</a><a href="#/stats">Skoða tölfræði</a></div><div className="eyebrow">SAGAN VARÐVEITT</div><h1>Kynningar</h1>
    <p>Veldu efni, forskoðaðu og gefðu út. Útgefnar síður breytast ekki þegar tölfræðin breytist síðar.</p>
    {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    <div className="card event-form"><h2>Ný kynning</h2>
      <label>Önn<select value={season?.id??''} onChange={e=>{setSeasonId(e.target.value);setStartDate('');invalidate()}}>{data?.seasons.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label>Tegund<select value={kind} onChange={e=>{const k=e.target.value as Presentation['kind'];setKind(k);setTitle(k==='midterm'?'Miðannamat':'Lokahóf');invalidate()}}><option value="midterm">Miðannamat</option><option value="final">Lokahóf</option></select></label>
      <label>Heiti<input value={title} onChange={e=>{setTitle(e.target.value);invalidate()}}/></label>
      <label>Dagsetning viðburðar<input type="date" value={eventDate} onChange={e=>{setEventDate(e.target.value);invalidate()}}/></label>
      <label>Gögn til og með<input type="date" max={eventDate} value={cutoff} onChange={e=>{setCutoff(e.target.value);invalidate()}}/></label>
      <label>Gögn frá og með<input type="date" max={cutoff} value={startsOn} onChange={e=>{setStartDate(e.target.value);invalidate()}}/></label>
      <p>Gögn á þessu tæki: {included.length} kláruð kvöld. Báðir dagar telja með. Ókláruð kvöld telja ekki. Samstilltu fyrst í <a href="#/cloud">Sync</a> til að sækja nýjustu samþykktu gögnin.</p>
      <details><summary>Kvöld sem telja í kynningunni</summary><ul>{included.map(s=><li key={s.id}>{s.playedOn}</li>)}</ul></details>
      <label>Lágmark sameiginlegra setta í bestu/verstu pörun<input type="number" min="1" step="1" value={minimum} onChange={e=>{setMinimum(Number(e.target.value));invalidate()}}/></label>
      <fieldset><legend>Efni kynningar</legend>{sections.map(([key,label])=><label className="event-check" key={key}><input type="checkbox" checked={selected.includes(key)} onChange={e=>{setSelected(s=>e.target.checked?[...s,key]:s.filter(k=>k!==key));invalidate()}}/>{label}</label>)}</fieldset>
      <label>Pallborðsumræða — eitt atriði í línu<textarea value={discussion} onChange={e=>{setDiscussion(e.target.value);invalidate()}}/></label>
      <p>Röðun: ABS = unnin sett / öll spiluð sett annarinnar. Aðalkeppni telur aðeins framlag sem fastamaður; varamenn eru sér.</p>
      <button disabled={!season||!selected.length||busy||!included.length||startsOn>cutoff} onClick={async()=>{setError('');try{const fresh=await readPresentationData();const s=fresh.seasons.find(s=>s.id===season?.id);if(!s)throw new Error('Veldu önn.');const p=buildPresentation(fresh,s,{title,kind,eventDate,startsOn,cutoff,sections:selected,minimumPairSets:minimum,discussion});setPreview(p);setView(p)}catch(e){setError((e as Error).message)}}}>Búa til forskoðun úr núverandi gögnum</button>
      {preview&&<div className="event-actions"><button onClick={()=>setView(preview)}>Opna forskoðun</button><button onClick={()=>download(preview)}>Sækja sjálfstæða HTML síðu</button><button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await publishPresentation(preview);setMessage('Kynning gefin út. Tengillinn er aðgengilegur án innskráningar.');setPreview(null)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}>{busy?'Gef út…':'Gefa út þessa útgáfu á vefnum'}</button><p>Útgáfa birtir nöfn og valda tölfræði öllum sem hafa tengilinn. Gögnin í þessari forskoðun verða varðveitt óbreytt.</p></div>}
    </div>
    <h2>Útgefnar kynningar</h2><button onClick={()=>{setError('');void refreshPresentations().catch(e=>setError(e.message))}}>Sækja útgáfur úr skýinu</button>
    {!archive?.length&&<p>Engar útgefnar kynningar á þessu tæki enn.</p>}
    {archive?.map(p=><article className="card" key={p.id}><h3>{p.title}</h3><p>{p.eventDate} · {p.kind==='midterm'?'Miðannamat':'Lokahóf'} · Gögn til {p.cutoff} · Útgefið {new Date(p.publishedAt).toLocaleString('is-IS')}</p><div className="event-actions"><button onClick={()=>setView(p)}>Sýna kynningu</button><a href={`#/published/${p.id}`}>Varanlegur tengill</a><button onClick={()=>download(p)}>Sækja HTML</button><button onClick={()=>setNotesFor(p)}>Niðurstöður pallborðs</button></div></article>)}
    <DiscussionNotebook/>
  </section>
}
