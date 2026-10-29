import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/localDb'
import { deckStyles, renderSlide } from '../services/presentationDesign'
import { DiscussionNotebook } from './DiscussionNotebook'
import { buildPresentation, downloadPresentation, fetchPublished, publishPresentation, readPresentationData, refreshPresentations, sections, type Presentation, type SectionKey } from '../services/presentations'

export function PresentationViewer({document:p,onBack,canEditDiscussion=false}:{document:Presentation;onBack:()=>void;canEditDiscussion?:boolean}){
  const [index,setIndex]=useState(0)
  const [error,setError]=useState('')
  const [discussionOpen,setDiscussionOpen]=useState(false)
  const move=(delta:number)=>setIndex(i=>Math.max(0,Math.min(p.slides.length-1,i+delta)))
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(discussionOpen){if(e.key==='Escape')setDiscussionOpen(false);return}if(e.target instanceof Element && (e.target.closest('select,input,textarea') || (e.key===' ' && e.target.closest('button,a,summary'))))return;if(['ArrowRight',' ','PageDown'].includes(e.key)){e.preventDefault();move(1)}if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();move(-1)}if(e.key==='Escape')onBack()};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[p.slides.length,onBack,discussionOpen])
  const addedTopics=useLiveQuery(async()=>canEditDiscussion?(await db.discussionNotes.where('presentationId').equals(p.id).toArray()).filter(e=>e.kind==='topic').map(e=>e.topic):[],[p.id,canEditDiscussion])??[]
  const frozenSlide=p.slides[index]??p.slides[0]
  const slide=canEditDiscussion&&frozenSlide.title.startsWith('Pallborðsumræða')?{...frozenSlide,rows:[...new Set([...frozenSlide.rows.map(r=>r[0]),...addedTopics])].map(t=>[t])}:frozenSlide
  return <section className="event-presentation"><style>{deckStyles}</style><header className="deck-toolbar"><a href="#/home">↗ Inn í kerfið</a><a href="#/stats">Tölfræði</a><button onClick={onBack}>← Loka kynningu</button>{canEditDiscussion&&<button onClick={()=>setDiscussionOpen(true)}>✎ Pallborð — bæta við / skrá</button>}<span>{p.title} · {p.eventDate}</span><button onClick={()=>{void downloadPresentation(p).catch(()=>setError('HTML niðurhal mistókst. Reyndu aftur.'))}}>↓ HTML</button><button onClick={()=>{void document.documentElement.requestFullscreen?.().catch(()=>setError('Ekki tókst að opna allan skjáinn.'))}}>⛶ Allur skjár</button></header>
    {discussionOpen&&<aside className="deck-discussion-panel" aria-label="Pallborð í kynningu"><button onClick={()=>setDiscussionOpen(false)}>← Aftur á sömu glæru</button><DiscussionNotebook presentation={p}/></aside>}{error&&<p role="alert">{error}</p>}<main key={index} className="deck-stage" dangerouslySetInnerHTML={{__html:renderSlide(slide,index)}}/>
    <footer className="deck-controls"><div className="deck-progress" style={{width:`${(index+1)/p.slides.length*100}%`}}/><button disabled={index===0} onClick={()=>move(-1)}>← Fyrri</button><label><select aria-label="Velja glæru" value={index} onChange={e=>setIndex(Number(e.target.value))}>{p.slides.map((s,i)=><option key={i} value={i}>{i+1}. {s.title}</option>)}</select></label><span className="deck-counter">{String(index+1).padStart(2,'0')} / {String(p.slides.length).padStart(2,'0')}</span><button disabled={index===p.slides.length-1} onClick={()=>move(1)}>Næsta →</button></footer></section>
}

export function PublishedPresentation({id}:{id:string}){
  const [p,setP]=useState<Presentation|null>(null),[error,setError]=useState('')
  useEffect(()=>{let active=true;setP(null);setError('');void fetchPublished(id).then(p=>{if(active){setP(p);if(!p)setError('Kynning fannst ekki eða hefur ekki verið gefin út.')}}).catch(e=>{if(active)setError(String(e.message))});return()=>{active=false}},[id])
  return p?<PresentationViewer key={id} document={p} onBack={()=>{location.hash='#/events'}}/>:<section className="screen"><p role="status">{error||'Sæki kynningu…'}</p><a href="#/events">Til baka</a></section>
}

export function PresentationsScreen({initialSeasonId='' }:{initialSeasonId?:string}){
  const data=useLiveQuery(readPresentationData,[])
  const archive=useLiveQuery(()=>db.presentations.orderBy('eventDate').reverse().toArray(),[])
  const [seasonId,setSeasonId]=useState(initialSeasonId),[kind,setKind]=useState<Presentation['kind']>('midterm')
  const [startDate,setStartDate]=useState('')
  const [eventDate,setEventDate]=useState(new Date().toISOString().slice(0,10)),[cutoff,setCutoff]=useState(new Date().toISOString().slice(0,10))
  const [title,setTitle]=useState('Miðannamat'),[selected,setSelected]=useState<SectionKey[]>(sections.filter(([k])=>k!=='extra').map(([k])=>k))
  const [minimum,setMinimum]=useState(3),[discussion,setDiscussion]=useState('Mætingin\nFramhaldið')
  const [tieOrder,setTieOrder]=useState<Record<string,string[]>>({})
  const [preview,setPreview]=useState<Presentation|null>(null),[view,setView]=useState<Presentation|null>(null)
  const [notesFor,setNotesFor]=useState<Presentation|null>(null)
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
  const download = (p:Presentation) => { void downloadPresentation(p).catch(() => setError('HTML niðurhal mistókst. Reyndu aftur.')) }
  useEffect(()=>{void refreshPresentations().catch(e=>setError(e.message))},[])
  const season=data?.seasons.find(s=>s.id===seasonId)??data?.seasons[0]
  const startsOn=startDate||season?.startsOn||''
  const included=data?.sessions.filter(s=>s.seasonId===season?.id&&s.status==='completed'&&s.playedOn>=startsOn&&s.playedOn<=cutoff).sort((a,b)=>a.playedOn.localeCompare(b.playedOn))??[]
  const invalidate=()=>{setPreview(null);setMessage('');setTieOrder({})}
  if(notesFor)return <section className="screen page-screen event-editor"><button onClick={()=>setNotesFor(null)}>← Til baka</button><DiscussionNotebook presentation={notesFor}/></section>
  if(view)return <PresentationViewer key={view.id} document={view} onBack={()=>setView(null)} canEditDiscussion/>
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
      <p>Bestu/verstu pörun sýna 20 valkosti fyrir kosningu í salnum, eða alla ef færri ná lágmarkinu. Oftast saman er ein síða með 20 algengustu pörunum.</p>
      <fieldset><legend>Efni kynningar</legend>{sections.map(([key,label])=><label className="event-check" key={key}><input type="checkbox" checked={selected.includes(key)} onChange={e=>{setSelected(s=>e.target.checked?[...s,key]:s.filter(k=>k!==key));invalidate()}}/>{label}</label>)}</fieldset>
      <label>Pallborðsumræða — eitt atriði í línu<textarea value={discussion} onChange={e=>{setDiscussion(e.target.value);invalidate()}}/></label>
      <p>Röðun: ABS → mæting → stig úr smáleikjum. ABS = unnin sett / öll spiluð sett tímabilsins. Aðalkeppni telur aðeins framlag sem fastamaður; varamenn eru sér.</p>
      {preview?.pendingTieGroups?.map(group=>{const key=[...group.playerIds].sort().join('|');return <fieldset key={key}><legend>Enn jafnt í ABS, mætingu og stigum — veljið eftir kosningu</legend>{group.places.map((place,i)=><label key={place}>{place}. sæti<select value={tieOrder[key]?.[i]??''} onChange={e=>setTieOrder(current=>{const order=[...(current[key]??[])];order[i]=e.target.value;return {...current,[key]:order}})}><option value="">Veldu leikmann</option>{group.playerIds.map(id=><option key={id} value={id} disabled={tieOrder[key]?.some((chosen,j)=>chosen===id&&j!==i)}>{preview.source?.players.find(p=>p.id===id)?.name??id}</option>)}</select></label>)}<p>Búðu aftur til forskoðun þegar úrslitaröð hefur verið valin. Aðeins einn leikmaður fær hvert sæti.</p></fieldset>})}
      <button disabled={!season||!selected.length||busy||!included.length||startsOn>cutoff} onClick={async()=>{setError('');try{const fresh=await readPresentationData();const s=fresh.seasons.find(s=>s.id===season?.id);if(!s)throw new Error('Veldu önn.');const p=buildPresentation(fresh,s,{title,kind,eventDate,startsOn,cutoff,sections:selected,minimumPairSets:minimum,finalTieOrder:Object.values(tieOrder).flat().filter(Boolean),discussion});setPreview(p);setView(p)}catch(e){setError((e as Error).message)}}}>Búa til forskoðun úr núverandi gögnum</button>
      {preview&&<div className="event-actions"><button onClick={()=>setView(preview)}>Opna forskoðun</button><button onClick={()=>download(preview)}>Sækja sjálfstæða HTML síðu</button><button disabled={busy||!!preview.pendingTieGroups?.length} onClick={async()=>{setBusy(true);setError('');try{await publishPresentation(preview);setMessage('Kynning gefin út. Tengillinn er aðgengilegur án innskráningar.');setPreview(null)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}>{busy?'Gef út…':'Gefa út þessa útgáfu á vefnum'}</button><p>Útgáfa birtir nöfn og valda tölfræði öllum sem hafa tengilinn. Gögnin í þessari forskoðun verða varðveitt óbreytt.</p></div>}
    </div>
    <h2>Útgefnar kynningar</h2><button onClick={()=>{setError('');void refreshPresentations().catch(e=>setError(e.message))}}>Sækja útgáfur úr skýinu</button>
    {!archive?.length&&<p>Engar útgefnar kynningar á þessu tæki enn.</p>}
    {archive?.map(p=><article className="card" key={p.id}><h3>{p.title}</h3><p>{p.eventDate} · {p.kind==='midterm'?'Miðannamat':'Lokahóf'} · Gögn til {p.cutoff} · Útgefið {new Date(p.publishedAt).toLocaleString('is-IS')}</p><div className="event-actions"><button onClick={()=>setView(p)}>Sýna kynningu</button><a href={`#/published/${p.id}`}>Varanlegur tengill</a><button onClick={()=>download(p)}>Sækja HTML</button><button onClick={()=>setNotesFor(p)}>Niðurstöður pallborðs</button></div></article>)}
    <DiscussionNotebook/>
  </section>
}
