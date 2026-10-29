import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/localDb'
import { buildSeasonAnalytics, seasonStartYearForDate, seasonYearsFromSessions } from '../services/seasonAnalytics'

export function StatsScreen({ onPresent }: { onPresent: (seasonId: string) => void }) {
  const data = useLiveQuery(async () => ({
    seasons: await db.seasons.orderBy('startsOn').reverse().toArray(), players: await db.players.toArray(), sessions: await db.sessions.toArray(), attendance: await db.sessionPlayers.toArray(),
    sets: await db.sets.toArray(), teams: await db.setTeams.toArray(), memberships: await db.setTeamMembers.toArray(),
    games: await db.games.toArray(), goals: await db.goals.toArray(), backfills: await db.sessionBackfills.toArray(),
  }), [])
  const [tab, setTab] = useState<'table'|'awards'|'records'|'shame'>('table')
  const [selectedId, setSelectedId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0,10))
  const [ranking, setRanking] = useState<'ABS'|'points'>('points')
  const selectedSeason = data?.seasons.find(s => s.id === selectedId) ?? data?.seasons[0]
  const startsOn = startDate || selectedSeason?.startsOn || ''
  const [roleFilter, setRoleFilter] = useState<'REGULAR'|'SUBSTITUTE'|'ALL'>('REGULAR')
  const analytics = useMemo(() => data ? buildSeasonAnalytics(data, selectedSeason ?? seasonStartYearForDate(new Date().toISOString().slice(0,10)), roleFilter, {startsOn,endsOn:endDate}) : null, [data, selectedSeason, roleFilter, startsOn, endDate])

  if (!data || !analytics) return <section className="screen loading-screen">Hleð tölfræði…</section>
  const playerName = (id?: string) => data.players.find(p => p.id === id)?.name ?? '—'
  const overall = [...analytics.players].sort((a,b)=>(ranking==='ABS'?b.setWins-a.setWins:b.points-a.points)||playerName(a.playerId).localeCompare(playerName(b.playerId),'is'))
  const shame = [...analytics.players].sort((a,b)=>b.nixDays-a.nixDays||b.chokes-a.chokes||b.zeroPointSets-a.zeroPointSets)
  const topGoals=[...analytics.players].sort((a,b)=>b.goals-a.goals)[0]
  const topPoints=[...analytics.players].sort((a,b)=>b.points-a.points)[0]
  const topRating=[...analytics.players].sort((a,b)=>b.rating-a.rating)[0]

  return <section className="screen page-screen stats-screen">
    {analytics.assistsIncomplete && <p className="data-quality-note">Stoðsendingar vantar í hluta skráningarinnar. Stoðsendingar og G+A telja aðeins skráð framlag.</p>}
    <div className="section-heading"><div><span className="eyebrow">TÍMABIL</span><h1>Tölfræði & verðlaun</h1></div><button className="presentation-button" onClick={()=>onPresent(selectedSeason?.id ?? String(seasonStartYearForDate(new Date().toISOString().slice(0,10))))}>▶ Kynning</button></div>
    <div className="season-picker card"><div><small>Valið tímabil</small><strong>{analytics.season.name}</strong></div><select value={selectedSeason?.id ?? ''} onChange={e=>{setSelectedId(e.target.value);setStartDate('')}}>{data.seasons.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
    <div className="card"><label>Gögn frá og með<input type="date" value={startsOn} max={endDate} onChange={e=>setStartDate(e.target.value)}/></label><label>Gögn til og með<input type="date" value={endDate} min={startsOn} onChange={e=>setEndDate(e.target.value)}/></label><label>Röðun<select value={ranking} onChange={e=>setRanking(e.target.value as 'ABS'|'points')}><option value="ABS">ABS — eins og í kynningum</option><option value="points">Stig í smáleikjum</option></select></label>
      <p>{startsOn}–{endDate}, báðir dagar meðtaldir. Aðeins kláruð kvöld valinnar annar úr gögnum á þessu tæki. ABS = unnin sett / {analytics.totals.sets} spiluð sett tímabilsins. Stig í smáleikjum eru önnur mæling. <a href="#/cloud">Samstilla gögn</a></p>
      {startsOn>endDate&&<p role="alert">Upphafsdagur þarf að vera fyrir eða á lokadegi.</p>}
      <details><summary>Kvöld sem telja ({analytics.sessions.length})</summary><ul>{analytics.sessions.map(s=><li key={s.id}>{s.playedOn}</li>)}</ul></details>
    </div>
    <div className="segmented"><button className={roleFilter==='REGULAR'?'active':''} onClick={()=>setRoleFilter('REGULAR')}>Fastamenn</button><button className={roleFilter==='SUBSTITUTE'?'active':''} onClick={()=>setRoleFilter('SUBSTITUTE')}>Varamenn</button><button className={roleFilter==='ALL'?'active':''} onClick={()=>setRoleFilter('ALL')}>Allir</button></div>
    <div className="season-metrics"><div><b>{analytics.totals.nights}</b><span>kvöld</span></div><div><b>{analytics.totals.sets}</b><span>sett</span></div><div><b>{analytics.totals.goals}</b><span>mörk</span></div><div><b>{analytics.totals.players}</b><span>leikmenn</span></div></div>
    {analytics.players.length > 0 && <div className="leader-cards"><StatLeader icon="🏆" label="Stigakóngur" value={`${topPoints?.points ?? 0} stig`} name={playerName(topPoints?.playerId)}/><StatLeader icon="⚽" label="Markakóngur" value={`${topGoals?.goals ?? 0} mörk`} name={playerName(topGoals?.playerId)}/><StatLeader icon="📈" label="Rating" value={`${topRating?.rating ?? 100}`} name={playerName(topRating?.playerId)}/></div>}
    <div className="segmented stats-tabs"><button className={tab==='table'?'active':''} onClick={()=>setTab('table')}>Tafla</button><button className={tab==='awards'?'active':''} onClick={()=>setTab('awards')}>Verðlaun</button><button className={tab==='records'?'active':''} onClick={()=>setTab('records')}>Met</button><button className={tab==='shame'?'active':''} onClick={()=>setTab('shame')}>😵</button></div>

    {tab==='table' && <div className="stats-table card season-table"><div className="stats-table-head season"><span>#</span><span>Leikmaður</span><span>Stig</span><span>Sett</span><span>⚽</span><span>🅰</span><span>R</span></div>{overall.map((row,index)=><div className="stats-table-row season" key={row.playerId}><span className="rank">{1+new Set(overall.slice(0,index).map(p=>ranking==='ABS'?p.setWins:p.points)).size}</span><span className="player-cell"><b>{playerName(row.playerId)}</b><small>{row.sessions} kvöld · ABS {analytics.totals.sets?fmt(100*row.setWins/analytics.totals.sets):'0'}% · ADJ {fmt(100*row.setWinRate)}%</small></span><strong>{row.points}</strong><span>{row.setWins}</span><span>{row.goals}</span><span>{row.assists}</span><span>{row.rating}</span></div>)}{!overall.length&&<div className="empty-table">Engin kláruð kvöld á þessu tímabili enn.</div>}</div>}

    {tab==='awards' && <div className="awards-grid">{analytics.awards.map(award=><article className={`award-card ${award.tone}`} key={award.key}><div className="award-icon">{award.icon}</div><small>{award.title}</small><h3>{playerName(award.playerId)}</h3><strong>{award.value}</strong><p>{award.detail}</p></article>)}</div>}

    {tab==='records' && <div className="records-grid">
      <RecordCard icon="🌋" label="Flest stig á kvöldi" rows={topRows(analytics.players,r=>r.bestNightPoints).map(r=>[playerName(r.playerId),`${r.bestNightPoints} stig`])}/>
      <RecordCard icon="💥" label="Flest mörk á kvöldi" rows={topRows(analytics.players,r=>r.bestNightGoals).map(r=>[playerName(r.playerId),`${r.bestNightGoals} mörk`])}/>
      <RecordCard icon="🎯" label="Flestar stoðs. á kvöldi" rows={topRows(analytics.players,r=>r.bestNightAssists).map(r=>[playerName(r.playerId),`${r.bestNightAssists} stoðs.`])}/>
      <RecordCard icon="⚡" label="Stig á kvöld" rows={topRows(analytics.players,r=>r.pointsPerNight).map(r=>[playerName(r.playerId),`${fmt(r.pointsPerNight)}`])}/>
      <RecordCard icon="👑" label="Settsigur %" rows={topRows(analytics.players,r=>r.setWinRate).map(r=>[playerName(r.playerId),`${Math.round(r.setWinRate*100)}%`])}/>
      <RecordCard icon="🔥" label="G+A á kvöld" rows={topRows(analytics.players,r=>r.contributionsPerNight).map(r=>[playerName(r.playerId),`${fmt(r.contributionsPerNight)}`])}/>
    </div>}

    {tab==='shame' && <><div className="stats-table card"><div className="stats-table-head"><span>#</span><span>Leikmaður</span><span>Nix</span><span>Choke</span><span>0-sett</span><span>Ch%</span></div>{shame.map((row,index)=><div className="stats-table-row" key={row.playerId}><span className="rank">{index+1}</span><span className="player-cell"><b>{playerName(row.playerId)}</b><small>{row.sessions} kvöld</small></span><strong className="choke-cell">{row.nixDays}</strong><span>{row.chokes}</span><span>{row.zeroPointSets}</span><span>{Math.round(row.chokeRate*100)}%</span></div>)}</div><div className="legend card"><div><b>😵 Choke</b><span>Endar með 3 stig en vinnur ekki settið.</span></div><div><b>🥚 0-sett</b><span>Endar heilt sett með 0 stig.</span></div><div><b>☠ Nix</b><span>Endar heilt kvöld með 0 stig samtals.</span></div></div></>}
  </section>
}

function StatLeader({icon,label,value,name}:{icon:string;label:string;value:string;name:string}) { return <article className="leader-card"><span>{icon}</span><small>{label}</small><strong>{name}</strong><b>{value}</b></article> }
function RecordCard({icon,label,rows}:{icon:string;label:string;rows:[string,string][]}) { return <article className="record-card card"><header><span>{icon}</span><strong>{label}</strong></header>{rows.map(([name,value],i)=><div key={`${name}-${i}`}><b>{i+1}</b><span>{name}</span><strong>{value}</strong></div>)}</article> }
function topRows<T>(rows:T[], fn:(row:T)=>number){return [...rows].sort((a,b)=>fn(b)-fn(a)).slice(0,5)}
const fmt=(n:number)=>n.toLocaleString('is-IS',{maximumFractionDigits:1})
