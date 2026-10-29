import type { Season } from '../domain/types'
import { buildSetTeamStats } from '../domain/rules'
import { buildSeasonAnalytics, type AnalyticsData } from './seasonAnalytics'
import { db } from '../db/localDb'
import { supabase } from '../lib/supabase'

export const sections = [
  ['facts','Nokkrar staðreyndir'], ['best','Besta pörunin'], ['worst','Versta pörunin'],
  ['never','Aldrei saman'], ['often','Oftast saman'], ['attendance','Besta og versta mæting'],
  ['choke','Kafnarinn'], ['goals','Marka hrókarnir'], ['nix','Nixarinn'],
  ['subs','Varamenn'], ['podium','Verðlaunasæti'], ['table','Staðan'],
  ['extra','Viðbót: stoðsendingar og kvöldmet'], ['discussion','Pallborðsumræða'],
  ['wild','Sturlaðar staðreyndir'],
] as const
export type SectionKey = typeof sections[number][0]
export interface Slide {
  title: string; note?: string; notice?: string; columns: string[]; rows: string[][]
  layout?: 'compact-table' | 'pair-list' | 'fun-facts'
  story?: { kind: 'choke' | 'nix' | 'podium'; phase: 'intro' | 'score' | 'reveal'; caption: string; value?: string; rank?: number; finale?: boolean }
}
export interface Presentation {
  id: string; title: string; seasonId: string; eventDate: string; cutoff: string
  kind: 'midterm' | 'final'; publishedAt: string; schemaVersion: 1
  slides: Slide[]; source?: AnalyticsData & { season: Season }
}
export async function readPresentationData() {
  return db.transaction('r', [db.seasons,db.players,db.sessions,db.sessionPlayers,db.sets,db.setTeams,db.setTeamMembers,db.games,db.goals,db.sessionBackfills], async () => ({
    seasons: await db.seasons.orderBy('startsOn').reverse().toArray(), players: await db.players.toArray(),
    sessions: await db.sessions.toArray(), attendance: await db.sessionPlayers.toArray(), sets: await db.sets.toArray(),
    teams: await db.setTeams.toArray(), memberships: await db.setTeamMembers.toArray(), games: await db.games.toArray(),
    goals: await db.goals.toArray(), backfills: await db.sessionBackfills.toArray(),
  }))
}
export function buildPresentation(data: AnalyticsData, season: Season, options: {
  title: string; kind: Presentation['kind']; eventDate: string; cutoff: string; sections: SectionKey[]; minimumPairSets: number; discussion: string
}): Presentation {
  if (!options.title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(options.eventDate) || !/^\d{4}-\d{2}-\d{2}$/.test(options.cutoff) || options.cutoff > options.eventDate) throw new Error('Athugaðu heiti, viðburðardag og lokadag gagna.')
  if (!Number.isInteger(options.minimumPairSets) || options.minimumPairSets < 1) throw new Error('Lágmark para þarf að vera heil tala, a.m.k. 1.')
  const sessions = data.sessions.filter(s => s.seasonId === season.id && s.status === 'completed' && s.playedOn <= options.cutoff)
  if (!sessions.length) throw new Error('Engin kláruð kvöld á þessu tímabili.')
  const sessionIds = new Set(sessions.map(s=>s.id)), sets = data.sets.filter(s=>sessionIds.has(s.sessionId))
  const setIds = new Set(sets.map(s=>s.id)), games = data.games.filter(g=>setIds.has(g.setId)), gameIds = new Set(games.map(g=>g.id))
  const attendance = data.attendance.filter(a=>sessionIds.has(a.sessionId))
  const playerIds = new Set(attendance.map(a=>a.playerId))
  const source = structuredClone({ season, players:data.players.filter(p=>playerIds.has(p.id)), sessions, attendance, sets,
    teams:data.teams.filter(t=>setIds.has(t.setId)), memberships:data.memberships.filter(m=>setIds.has(m.setId)), games,
    goals:data.goals.filter(g=>gameIds.has(g.gameId)), backfills:data.backfills?.filter(b=>sessionIds.has(b.sessionId)) ?? [] })
  const regular = buildSeasonAnalytics(source,season), subs = buildSeasonAnalytics(source,season,'SUBSTITUTE')
  const all = buildSeasonAnalytics(source,season,'ALL')
  const name = (id:string)=>source.players.find(p=>p.id===id)?.name ?? id
  const pct = (a:number,b:number)=>b ? `${(100*a/b).toLocaleString('is-IS',{maximumFractionDigits:1})}%` : '—'
  const totalSets = sets.filter(s=>s.status==='completed'||games.some(g=>g.setId===s.id&&g.startedAt)).length + source.backfills.reduce((n,b)=>n+b.rounds.length,0)
  const regularIds = [...new Set(attendance.filter(a=>a.roleAtSession==='REGULAR').map(a=>a.playerId))].sort((a,b)=>name(a).localeCompare(name(b),'is'))
  const pairs = new Map<string,{ids:string[]; played:number; wins:number; goals:number; chokes:number}>()
  for(let i=0;i<regularIds.length;i++)for(let j=i+1;j<regularIds.length;j++)pairs.set(JSON.stringify([regularIds[i],regularIds[j]]),{ids:[regularIds[i],regularIds[j]],played:0,wins:0,goals:0,chokes:0})
  const addTeam = (sessionId:string, ids:string[], wins:boolean, goals:number, choke:boolean)=>{
    const eligible = ids.filter(id=>attendance.some(a=>a.sessionId===sessionId&&a.playerId===id&&a.roleAtSession==='REGULAR'))
    for(const pair of pairs.values())if(pair.ids.every(id=>eligible.includes(id))){pair.played++;pair.wins+=Number(wins);pair.goals+=goals;pair.chokes+=Number(choke)}
  }
  for(const set of sets){
    const localGames=games.filter(g=>g.setId===set.id)
    if(set.status!=='completed'&&!localGames.some(g=>g.startedAt))continue
    const session=sessions.find(s=>s.id===set.sessionId)!
    for(const team of buildSetTeamStats(set,source.teams.filter(t=>t.setId===set.id),localGames,session))
      addTeam(session.id,source.memberships.filter(m=>m.teamId===team.teamId).map(m=>m.playerId),team.isWinner,team.smallWins,team.isChoke)
  }
  for(const b of source.backfills)for(const round of b.rounds){
    const highest=Math.max(...b.teams.map(t=>round.teamGoals[t.code]??0))
    const leaders=b.teams.filter(t=>(round.teamGoals[t.code]??0)===highest)
    for(const t of b.teams){const score=round.teamGoals[t.code]??0;const won=highest>=4&&leaders.length===1&&leaders[0].code===t.code;addTeam(b.sessionId,t.playerIds,won,score,!won&&score===3)}
  }
  const slides:Slide[]=[{title:options.title.trim(),note:`${season.name} · ${options.eventDate} · Gögn til og með ${options.cutoff}`,columns:[],rows:[]}]
  const add=(key:SectionKey,title:string,columns:string[],rows:string[][],note?:string,notice?:string)=>{
    if(!options.sections.includes(key))return
    if (['best','worst','attendance','goals','extra'].includes(key)) {
      const total = rows.length
      rows = rows.slice(0, 5)
      if (total > 5) note = `${note ?? ''} Sýndar eru 5 af ${total} niðurstöðum.`.trim()
    }
    const pageSize = key === 'table' ? Math.max(1,rows.length) : key === 'never' ? 32 : key === 'often' ? 20 : 8
    const pages=Math.max(1,Math.ceil(rows.length/pageSize))
    for(let page=0;page<pages;page++)slides.push({title:pages>1?`${title} · ${page+1}/${pages}`:title,columns,rows:rows.slice(page*pageSize,page*pageSize+pageSize),note:note??(rows.length?undefined:'Engin skráð niðurstaða.'),...(notice?{notice}:{}),...(key==='table'||key==='often'?{layout:'compact-table' as const}:key==='never'?{layout:'pair-list' as const}:{})})
  }
  const common='Fastamenn eingöngu, samkvæmt hlutverki hvers kvölds. Jafnar tölur eru jafnar niðurstöður.'
  const awardStory = (key: 'choke' | 'nix', title: string, metric: 'chokes' | 'nixDays', unit: string, note: string) => {
    if (!options.sections.includes(key)) return
    const levels = [...new Set(regular.players.map(p => p[metric]).filter(value => value > 0))].sort((a,b)=>b-a).slice(0,key==='choke'?3:2).reverse()
    if (!levels.length) {
      slides.push({ title, columns: [], rows: [], note, story: { kind: key, phase: 'score', value: '0', caption: 'Enginn á þennan vafasama heiður. Í bili.' } })
      return
    }
    levels.forEach((value, levelIndex) => {
      const members = regular.players.filter(p=>p[metric]===value).sort((a,b)=>name(a.playerId).localeCompare(name(b.playerId),'is'))
      const highest = levelIndex === levels.length - 1
      slides.push({ title, columns: ['Leikmaður',unit], rows: members.map(p=>[name(p.playerId),String(value)]), note, story: { kind: key, phase: 'reveal', value: `${value} ${unit}`, caption: highest ? (members.length>1?'Þeir deila þessum vafasama heiðri.':'Hér er meistarinn í þessum flokki!') : (levelIndex===0?'Þetta leit svo vel út…':'En það er hægt að gera enn verr…'), finale: highest } })
    })
  }
  add('facts','Nokkrar staðreyndir',['Staðreynd','Fjöldi'],[['Kvöld',String(sessions.length)],['Sett',String(totalSets)],['Skráð mörk',String(all.totals.goals)],['Leikmenn',String(all.players.length)],['Varamenn',String(subs.players.length)],['Varamenn sem mættu',subs.players.map(p=>name(p.playerId)).join(', ')||'Engir'],['Mæting fastamanna',pct(regular.players.reduce((n,p)=>n+p.sessions,0),regular.players.length*sessions.length)]],'Mæting miðar við fastamenn með skráða mætingu á tímabilinu × öll kvöld. Mörk telja skráð einstaklingsmörk og sjálfsmörk; eldri liðsmörk geta haft aðra þekju.')
  const pairRows=(ps:typeof pairs extends Map<string,infer P>?P[]:never)=>ps.map(p=>[p.ids.map(name).join(' + '),String(p.wins),String(p.played),pct(p.wins,p.played),String(p.goals),String(p.chokes)])
  const eligible=[...pairs.values()].filter(p=>p.played>=options.minimumPairSets)
  const pairNote=`${common} Lágmark ${options.minimumPairSets} sameiginleg sett. Hlutfall = unnin / sameiginleg sett. Mörk = sigrar í smáleikjum (eldri gögn: liðsmörk).`
  add('best','Besta pörunin',['Par','Sigrar','Sett','Hlutfall','Mörk','Choke'],pairRows([...eligible].sort((a,b)=>b.wins/b.played-a.wins/a.played||b.played-a.played)),pairNote)
  add('worst','Versta pörunin',['Par','Sigrar','Sett','Hlutfall','Mörk','Choke'],pairRows([...eligible].sort((a,b)=>a.wins/a.played-b.wins/b.played||b.played-a.played)),pairNote)
  add('never','Aldrei saman',['Par'],[...pairs.values()].filter(p=>!p.played).map(p=>[p.ids.map(name).join(' + ')]),`${common} Leikmenn sem hafa mætt sem fastamenn á tímabilinu.`)
  add('often','Oftast saman',['Par','Sigrar','Sett','Hlutfall','Mörk','Choke'],pairRows([...pairs.values()].filter(p=>p.played).sort((a,b)=>b.played-a.played)),`${common} Öll pör sem hafa spilað saman, raðað eftir sameiginlegum settum. Hlutfall = unnin / sameiginleg sett.`)
  const playerRows=(metric:'sessions'|'chokes'|'goals'|'nixDays',ascending=false)=>[...regular.players].sort((a,b)=>(ascending?1:-1)*(a[metric]-b[metric])).map(p=>[name(p.playerId),String(p[metric]),...(metric==='sessions'?[pct(p.sessions,sessions.length)]:[])])
  add('attendance','Besta mæting',['Leikmaður','Kvöld','Mæting'],playerRows('sessions'),`${common} Mæting / öll kláruð kvöld; aðeins kvöld sem fastamaður telja í teljara.`)
  add('attendance','Versta mæting',['Leikmaður','Kvöld','Mæting'],playerRows('sessions',true),common)
  awardStory('choke','Kafnarinn','chokes','choke',`${common} Choke: tapsett með einu stigi minna en þarf til sigurs.`)
  add('goals','Marka hrókarnir',['Leikmaður','Mörk'],playerRows('goals'),`${common} Sjálfsmörk telja ekki sem mörk skorarans.`)
  awardStory('nix','Nixarinn','nixDays','nix',`${common} Nix: heilt kvöld án stigs.`)
  const standings=[...regular.players].sort((a,b)=>b.setWins-a.setWins||name(a.playerId).localeCompare(name(b.playerId),'is'))
  const tableRows=(players:typeof standings,includeAssists=false)=>players.map(p=>[name(p.playerId),String(p.setWins),pct(p.setWins,totalSets),pct(p.setWins,p.setsPlayed),String(p.goals),...(includeAssists?[String(p.assists),String(p.contributions)]:[]),String(p.chokes),String(p.nixDays),pct(p.sessions,sessions.length)])
  const columns=['Leikmaður','Sett','ABS','ADJ','Mörk','Choke','Nix','Mæting']
  const rankingNote=`${common} ABS = unnin sett / ${totalSets} sett annarinnar. ADJ = unnin sett / spiluð sett viðkomandi. Röðun eftir ABS; jafntefli deila sæti.`
  add('subs','Varamenn',columns,tableRows([...subs.players].sort((a,b)=>b.setWins-a.setWins)),'Aðeins framlag á kvöldum sem varamaður. ABS og mæting nota öll kvöld/sett tímabilsins.')
  if(options.sections.includes('podium'))for(const rank of [3,2,1]){
    const values = [...new Set(standings.map(p=>p.setWins))]
    const winners=standings.filter(p=>p.setWins===values[rank-1])
    if(!winners.length)continue
    const title=`${rank}. sæti`, score=pct(winners[0].setWins,totalSets)
    slides.push({title,columns:['Leikmaður','ABS','Unnin sett'],rows:winners.map(p=>[name(p.playerId),pct(p.setWins,totalSets),String(p.setWins)]),note:`${rankingNote} Verðlaun: þrjú efstu ólíku ABS-hlutföllin; jafnir fá sömu verðlaun.`,story:{kind:'podium',phase:'reveal',rank,value:score,caption:rank===1?(winners.length>1?'Toppnum er deilt. Dýrðin líka.':'Toppurinn er þinn. Njóttu augnabliksins.'):winners.length>1?'Sætið er sameiginlegt. Fagnaðarlætin líka.':'Stígðu fram. Þetta er þitt augnablik.',finale:rank===1}})
  }
  add('table','Staðan',[...columns.slice(0,5),'Assist','G+A',...columns.slice(5)],tableRows(standings,true),rankingNote,regular.assistsIncomplete?'Stoðsendingar vantar í hluta gagnanna. Assist og G+A sýna aðeins skráð framlag.':undefined)
  add('extra','Stoðsendingar og kvöldmet',['Leikmaður','Stoðs.','G+A','Flest stig á kvöldi'],[...regular.players].sort((a,b)=>b.contributions-a.contributions).map(p=>[name(p.playerId),String(p.assists),String(p.contributions),String(p.bestNightPoints)]),regular.assistsIncomplete?'Stoðsendingar vantar í hluta gagnanna. G+A sýnir aðeins skráð framlag.':common)
  add('discussion','Pallborðsumræða',['Umræðuefni'],options.discussion.split('\n').map(s=>s.trim()).filter(Boolean).map(s=>[s]))
  if(options.sections.includes('wild')) {
    const facts:string[][]=[]
    if(standings.length){
      const leaders=standings.filter(p=>p.setWins===standings[0].setWins)
      const next=standings.find(p=>p.setWins<standings[0].setWins)
      if(leaders.length>1)facts.push(['Það er þröngt á toppnum',`${leaders.length} menn`,`${leaders.map(p=>name(p.playerId)).join(', ')} deila toppnum með ${standings[0].setWins} unnin sett.`])
      else if(next)facts.push(['Bilið á toppnum',`${leaders[0].setWins-next.setWins} sett`,`${name(leaders[0].playerId)} hefur ${leaders[0].setWins} unnin sett; næsta niðurstaða er ${next.setWins}.`])
      const scorers=[...regular.players].sort((a,b)=>b.goals-a.goals), totalGoals=scorers.reduce((n,p)=>n+p.goals,0)
      if(totalGoals>0){const top=scorers.filter(p=>p.goals>0).slice(0,3);const goals=top.reduce((n,p)=>n+p.goals,0);facts.push(['Markaverksmiðjan',pct(goals,totalGoals),`${top.map(p=>name(p.playerId)).join(', ')}: ${goals} af ${totalGoals} mörkum fastamanna. ${top.length===1?'Einn maður sér':`${top.length} menn sjá`} um þetta.`])}
      const unbeaten=eligible.filter(p=>p.wins===p.played).sort((a,b)=>b.played-a.played)[0]
      const never=[...pairs.values()].filter(p=>!p.played).length
      if(unbeaten)facts.push(['Þetta par kann ekki að tapa',`${unbeaten.wins}/${unbeaten.played}`,`${unbeaten.ids.map(name).join(' + ')} hafa unnið öll ${unbeaten.played} sameiginleg sett. Lágmark í samanburði: ${options.minimumPairSets} sett.`])
      else facts.push(['Óskrifaðar ástarsögur',`${never} pör`,`${never} pör fastamanna sem hafa mætt hafa enn ekki spilað saman í liði.`])
      const choke=[...regular.players].sort((a,b)=>b.chokes-a.chokes)[0]
      if(choke?.chokes)facts.push(['Svo nálægt. Svo oft.',`${choke.chokes} choke`,`${name(choke.playerId)} hefur lokið ${choke.chokes} tapsettum með 3 stig. Unnin sett hjá sama leikmanni: ${choke.setWins}.`])
    }
    if(!facts.length)facts.push(['Sagan er rétt að byrja',`${sessions.length} kvöld`,'Ekki næg fastamannagögn fyrir fleiri samanburði enn.'])
    if(slides.length===1)slides.push({title:'Takk fyrir kvöldið',columns:[],rows:[]})
    slides.splice(slides.length-1,0,{title:'Sturlaðar staðreyndir',layout:'fun-facts',columns:['Staðreynd','Tala','Sagan'],rows:facts.slice(0,4),note:'Reiknað úr sama frysta gagnasafni og kynningin. Aðeins framlag sem fastamaður; pör telja sameiginleg sett. Þetta eru lýsingar á skráðum gögnum, ekki spár.'})
  }
  return {id:crypto.randomUUID(),schemaVersion:1,title:options.title.trim(),seasonId:season.id,kind:options.kind,eventDate:options.eventDate,cutoff:options.cutoff,publishedAt:new Date().toISOString(),slides,source}
}

export async function publishPresentation(p:Presentation) {
  if(!supabase)throw new Error('Tengja þarf Supabase og keyra migration 018 fyrir vefútgáfu. Forskoðun og HTML niðurhal virka án nets.')
  const {error}=await supabase.rpc('publish_presentation',{document:p})
  if(error)throw new Error('Útgáfa mistókst. Athugaðu nettengingu, stjórnandaaðgang og migration 018.')
  await db.presentations.put(p)
}
export async function fetchPublished(id:string):Promise<Presentation|null> {
  const local=await db.presentations.get(id)
  if(local)return local
  if(!supabase)return null
  const {data,error}=await supabase.rpc('get_published_presentation',{presentation_id:id})
  if(error)throw new Error('Ekki tókst að sækja kynninguna.')
  return data as Presentation|null
}
export async function refreshPresentations(){
  if(!supabase)return
  const {data,error}=await supabase.rpc('list_presentations')
  if(error)throw new Error('Ekki tókst að sækja útgefnar kynningar. Athugaðu tengingu og migration 018.')
  if(Array.isArray(data))await db.presentations.bulkPut(data as Presentation[])
}
export { downloadPresentation } from './presentationExport'
