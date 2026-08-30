import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/localDb'
import { buildSeasonAnalytics } from '../services/seasonAnalytics'

export function SeasonPresentationScreen({ seasonYear, onBack }: { seasonYear: number; onBack: () => void }) {
  const data = useLiveQuery(async () => ({players:await db.players.toArray(),sessions:await db.sessions.toArray(),attendance:await db.sessionPlayers.toArray(),sets:await db.sets.toArray(),teams:await db.setTeams.toArray(),memberships:await db.setTeamMembers.toArray(),games:await db.games.toArray(),goals:await db.goals.toArray()}),[])
  const [slide,setSlide]=useState(0)
  const analytics=useMemo(()=>data?buildSeasonAnalytics(data,seasonYear):null,[data,seasonYear])
  const slides=useMemo(()=>analytics?makeSlides(analytics):[],[analytics])
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='ArrowRight'||e.key===' ')setSlide(s=>Math.min(slides.length-1,s+1));if(e.key==='ArrowLeft')setSlide(s=>Math.max(0,s-1));if(e.key==='Escape')onBack()};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[slides.length,onBack])
  if(!data||!analytics)return <div className="presentation loading-screen">Hleð kynningu…</div>
  const current=slides[slide]
  const name=(id?:string)=>data.players.find(p=>p.id===id)?.name??'—'
  return <section className="presentation">
    <header className="presentation-top"><button onClick={onBack}>← Loka</button><span>{analytics.season.name} · {slide+1}/{slides.length}</span><button onClick={()=>void document.documentElement.requestFullscreen?.()}>⛶ Full screen</button></header>
    <main className={`presentation-slide ${current.kind}`}>
      {current.kind==='title'&&<><span className="presentation-ball">⚽</span><div className="eyebrow">MÁNUDAGSBOLTINN</div><h1>{analytics.season.name}</h1><p>Tímabilið í tölum, metum og verðlaunum</p><div className="presentation-metrics"><b>{analytics.totals.nights}<small>kvöld</small></b><b>{analytics.totals.sets}<small>sett</small></b><b>{analytics.totals.goals}<small>mörk</small></b><b>{analytics.totals.players}<small>leikmenn</small></b></div></>}
      {current.kind==='leaderboard'&&<><div className="eyebrow">HEILDARSTAÐAN</div><h2>Hver á tímabilið?</h2><div className="presentation-leaderboard">{[...analytics.players].sort((a,b)=>b.points-a.points||b.setWins-a.setWins).slice(0,8).map((r,i)=><div key={r.playerId}><b>{i+1}</b><strong>{name(r.playerId)}</strong><span>{r.points} stig</span><small>🏆 {r.setWins} · ⚽ {r.goals} · 🅰 {r.assists}</small></div>)}</div></>}
      {current.kind==='awards'&&<><div className="eyebrow">VERÐLAUN</div><h2>{current.title}</h2><div className="presentation-awards">{current.awards.map(a=><article key={a.key} className={a.tone}><span>{a.icon}</span><small>{a.title}</small><h3>{name(a.playerId)}</h3><strong>{a.value}</strong><p>{a.detail}</p></article>)}</div></>}
      {current.kind==='shame'&&<><div className="eyebrow">SKAMMARVEGGURINN</div><h2>Það þarf líka að varðveita þetta.</h2><div className="presentation-awards shame">{analytics.awards.filter(a=>a.tone==='bad').map(a=><article key={a.key} className="bad"><span>{a.icon}</span><small>{a.title}</small><h3>{name(a.playerId)}</h3><strong>{a.value}</strong><p>{a.detail}</p></article>)}</div></>}
    </main>
    <footer className="presentation-controls"><button disabled={slide===0} onClick={()=>setSlide(s=>Math.max(0,s-1))}>←</button><div>{slides.map((_,i)=><i key={i} className={i===slide?'active':''}/>)}</div><button disabled={slide===slides.length-1} onClick={()=>setSlide(s=>Math.min(slides.length-1,s+1))}>→</button></footer>
  </section>
}

function makeSlides(analytics:any){
  const positive=analytics.awards.filter((a:any)=>a.tone!=='bad')
  const chunks=[] as any[]
  for(let i=0;i<positive.length;i+=4)chunks.push({kind:'awards',title:i===0?'Stóru titlarnir':'Fleiri afrek',awards:positive.slice(i,i+4)})
  return [{kind:'title'},{kind:'leaderboard'},...chunks,{kind:'shame'}]
}
