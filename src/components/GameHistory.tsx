import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/localDb'
import { pauseGame } from '../data/repository'
import { readGameHistory, reverseGameCorrection, saveGameEdit, type GameEdit } from '../data/gameHistory'
import { correctedSet, gamesAfterTarget, historyResult } from '../domain/gameHistory'
import type { Game, GameHistorySnapshot } from '../domain/types'

export function GameHistory({ sessionId }: { sessionId: string }) {
  const data = useLiveQuery(async () => {
    const session = await db.sessions.get(sessionId)
    const sets = await db.sets.where('sessionId').equals(sessionId).sortBy('setNo')
    const snapshots = await Promise.all(sets.map(s => readGameHistory(s.id)))
    return { session, snapshots, teams: await db.setTeams.where('setId').anyOf(sets.map(s=>s.id)).toArray(), members: await db.setTeamMembers.where('setId').anyOf(sets.map(s=>s.id)).toArray(), players: await db.players.toArray(), frozen: !!await db.submissions.get(sessionId), backfill: !!await db.sessionBackfills.get(sessionId) }
  }, [sessionId])
  const [open, setOpen] = useState(false)
  const [snapshot, setSnapshot] = useState<GameHistorySnapshot | null>(null)
  const [edit, setEdit] = useState<GameEdit | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [reason, setReason] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const closeButton = useRef<HTMLButtonElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    closeButton.current?.focus()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous; opener.current?.focus() }
  }, [open])
  if (!data?.session || data.backfill) return null
  const session = data.session
  const teamName = (id: string) => data.teams.find(t=>t.id===id)?.name ?? 'Óþekkt lið'
  const playerName = (id: string) => data.players.find(p=>p.id===id)?.name ?? 'Óþekktur leikmaður'
  async function run(action: () => Promise<unknown>) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { await action() } catch (e) { setError(e instanceof Error ? e.message : 'Aðgerð mistókst.') }
    finally { lock.current = false; setBusy(false) }
  }
  function choose(s: GameHistorySnapshot, game?: Game) {
    const teams = data!.teams.filter(t=>t.setId===s.set.id).sort((a,b)=>a.sortOrder-b.sortOrder)
    const goal = s.goals.find(g=>g.gameId===game?.id && !g.deletedAt)
    setSnapshot(structuredClone(s)); setReason(''); setConfirm(false); setDeleting(false); setError('')
    setEdit({ gameId: game?.id, position: game?.gameNo ?? s.games.filter(g=>g.status==='completed').length+1,
      holderTeamId: game?.holderTeamId ?? teams[0].id, challengerTeamId: game?.challengerTeamId ?? teams[1].id,
      result: game?.endReason === 'timeout' ? 'timeout' : 'goal', winningTeamId: game?.winningTeamId ?? '',
      scorerPlayerId: goal?.scorerPlayerId ?? '', assistPlayerId: goal?.assistPlayerId ?? '', assistsRecorded: goal ? goal.assistsRecorded !== false : session.assistsEnabled !== false, ownGoal: goal?.eventType==='OWN_GOAL', exitingTeamId: game?.exitingTeamId ?? '' })
  }
  const teams = snapshot ? data.teams.filter(t=>t.setId===snapshot.set.id) : []
  const selectedTeams = edit ? teams.filter(t=>[edit.holderTeamId,edit.challengerTeamId].includes(t.id)) : []
  const scorerTeam = edit?.ownGoal ? selectedTeams.find(t=>t.id!==edit.winningTeamId)?.id : edit?.winningTeamId
  const playersFor = (teamId?: string) => data.players.filter(p=>data.members.some(m=>m.teamId===teamId && m.playerId===p.id))
  let previewGames = snapshot?.games ?? []
  if (snapshot && edit) {
    previewGames = snapshot.games.filter(g=>g.id!==edit.gameId)
    if (!deleting) previewGames = [...previewGames.slice(0,edit.position-1), { ...(snapshot.games.find(g=>g.id===edit.gameId) ?? snapshot.games[0]), id: edit.gameId ?? 'preview', status: 'completed', winningTeamId: edit.result==='goal' ? edit.winningTeamId : null } as Game, ...previewGames.slice(edit.position-1)]
    previewGames = previewGames.map((g,i)=>({...g,gameNo:i+1}))
  }
  const previewSet = snapshot ? correctedSet(snapshot.set, previewGames, session, data.snapshots.at(-1)?.set.id!==snapshot.set.id || session.status==='completed') : null
  const wins = (games: Game[], id: string) => games.filter(g=>g.status==='completed' && g.winningTeamId===id).length
  const valid = !!edit && edit.holderTeamId!==edit.challengerTeamId && (edit.result==='timeout' ? teams.length===2 || selectedTeams.some(t=>t.id===edit.exitingTeamId) : selectedTeams.some(t=>t.id===edit.winningTeamId) && playersFor(scorerTeam).some(p=>p.id===edit.scorerPlayerId))
  const reset = () => { setEdit(null); setSnapshot(null); setConfirm(false); setError('') }
  return <>
    <button ref={opener} className="history-open" disabled={busy} onClick={()=>void run(async()=>{
      for (const s of data.snapshots) for (const g of s.games.filter(g=>g.status==='live')) await pauseGame(g.id)
      reset(); setOpen(true)
    })}>☷ Leikir og leiðréttingar</button>
    {!open && error && <p role="alert">{error}</p>}
    {open && <div className="game-history-overlay" role="dialog" aria-modal="true" aria-labelledby="game-history-title" ref={dialog} onKeyDown={e=>{
      if (e.key==='Escape' && !busy) { if (edit) reset(); else setOpen(false) }
      if (e.key==='Tab') {
        const nodes = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary') ?? [])
        const first=nodes[0], last=nodes.at(-1)
        if (e.shiftKey && document.activeElement===first) { e.preventDefault(); last?.focus() }
        else if (!e.shiftKey && document.activeElement===last) { e.preventDefault(); first?.focus() }
      }
    }}><section className="game-history-sheet">
      <header><div><span className="eyebrow">LEIKJASAGA KVÖLDSINS</span><h2 id="game-history-title">Leikir og leiðréttingar</h2></div><button ref={closeButton} disabled={busy} onClick={()=>{reset();setOpen(false)}}>Loka</button></header>
      <p>Klukkan helst í pásu. Síðari viðureignir og settaskipting haldast við leiðréttingu.</p>
      {data.frozen && <p className="warning-banner">Kvöldið er innsent. Stjórnandi sér um frekari leiðréttingar eftir samþykkt.</p>}
      {error && <p className="warning-banner" role="alert">{error}</p>}
      {edit && snapshot ? <div className="history-editor">
        <h3>{deleting ? 'Fjarlægja leik' : edit.gameId ? 'Breyta leik' : 'Bæta inn leik'} · sett {snapshot.set.setNo}</h3>
        {!edit.gameId && <p>Veldu viðureignina sem var spiluð. Nákvæmur upphafs- og lokatími verður ekki búinn til fyrir innsettan leik.</p>}
        {!confirm && <>
          {!deleting && <div className="history-fields">
            <label>Staðsetning í setti<select value={edit.position} onChange={e=>setEdit({...edit,position:Number(e.target.value)})}>{Array.from({length:snapshot.games.filter(g=>g.status==='completed').length+(edit.gameId?0:1)},(_,i)=><option key={i} value={i+1}>Leikur {i+1}</option>)}</select></label>
            <label>Fyrra lið<select value={edit.holderTeamId} onChange={e=>setEdit({...edit,holderTeamId:e.target.value,winningTeamId:'',scorerPlayerId:'',assistPlayerId:'',exitingTeamId:''})}>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
            <label>Seinna lið<select value={edit.challengerTeamId} onChange={e=>setEdit({...edit,challengerTeamId:e.target.value,winningTeamId:'',scorerPlayerId:'',assistPlayerId:'',exitingTeamId:''})}>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
            <label>Úrslit<select value={edit.result} onChange={e=>setEdit({...edit,result:e.target.value as GameEdit['result']})}><option value="goal">Mark / sigur</option><option value="timeout">Jafntefli · 3 mínútur</option></select></label>
            {edit.result==='goal' ? <>
              <label>Sigurlið<select value={edit.winningTeamId} onChange={e=>setEdit({...edit,winningTeamId:e.target.value,scorerPlayerId:'',assistPlayerId:''})}><option value="">Veldu lið</option>{selectedTeams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
              <button className="own-goal-toggle" aria-pressed={edit.ownGoal} onClick={()=>setEdit({...edit,ownGoal:!edit.ownGoal,scorerPlayerId:'',assistPlayerId:''})}>{edit.ownGoal?'✓ Sjálfsmark':'Skrá sem sjálfsmark'}</button>
              <label>{edit.ownGoal?'Leikmaður sem skoraði sjálfsmark':'Markaskorari'}<select value={edit.scorerPlayerId} onChange={e=>setEdit({...edit,scorerPlayerId:e.target.value,assistPlayerId:''})}><option value="">Veldu leikmann</option>{playersFor(scorerTeam).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
              {!edit.ownGoal && <label>Stoðsending<select value={edit.assistsRecorded===false?'__unknown':edit.assistPlayerId} onChange={e=>setEdit({...edit,assistsRecorded:e.target.value!=='__unknown',assistPlayerId:e.target.value==='__unknown'?'':e.target.value})}><option value="__unknown">Ekki skráð</option><option value="">Engin stoðsending</option>{playersFor(edit.winningTeamId).filter(p=>p.id!==edit.scorerPlayerId).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
            </> : teams.length===3 && <label>Liðið sem fór út<select value={edit.exitingTeamId} onChange={e=>setEdit({...edit,exitingTeamId:e.target.value})}><option value="">Veldu lið</option>{selectedTeams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
          </div>}
          <label>Ástæða leiðréttingar<input value={reason} onChange={e=>setReason(e.target.value)} placeholder="T.d. mark skráð á rangt lið"/></label>
          <div className="history-actions"><button disabled={busy} onClick={reset}>Hætta við</button><button className="primary" disabled={busy || !reason.trim() || (!deleting && !valid)} onClick={()=>setConfirm(true)}>Yfirfara breytingu</button></div>
          {edit.gameId && !deleting && <button className="danger-text" onClick={()=>setDeleting(true)}>Fjarlægja þennan leik…</button>}
        </>}
        {confirm && <div className="history-preview">
          <h3>{deleting?'Leikurinn verður fjarlægður':'Þetta verður vistað'}</h3>
          {!deleting && <p>{teamName(edit.holderTeamId)} – {teamName(edit.challengerTeamId)} · {edit.result==='timeout'?'Jafntefli':`${teamName(edit.winningTeamId)} vinnur · ${playerName(edit.scorerPlayerId)}${edit.ownGoal?' (sjálfsmark)':''}${edit.assistPlayerId?` · stoð: ${playerName(edit.assistPlayerId)}`:''}`}</p>}
          <p>{reason}</p>
          {!deleting && edit.result==='goal' && !edit.ownGoal && edit.assistsRecorded===false && <p>Stoðsending: ekki skráð.</p>}
          <table><thead><tr><th>Lið</th><th>Sigrar áður</th><th>Sigrar eftir</th></tr></thead><tbody>{teams.map(t=><tr key={t.id}><th>{t.name}</th><td>{wins(snapshot.games,t.id)}</td><td>{wins(previewGames,t.id)}</td></tr>)}</tbody></table>
          <p>Settsigur: {snapshot.set.winningTeamId?teamName(snapshot.set.winningTeamId):'Enginn'} → <strong>{previewSet?.winningTeamId?teamName(previewSet.winningTeamId):'Enginn'}</strong>.</p>
          <p>Síðari leikir halda sínum liðum og úrslitum. Leikjanúmer færast ef leik er bætt inn, hann færður eða fjarlægður.</p>
          {!previewSet?.winningTeamId && snapshot.set.status==='completed' && <p className="warning-banner">Þetta sett hefur ekki lengur næga sigra til að veita settsigur. Það færist ekki saman við næsta sett.</p>}
          {gamesAfterTarget(previewGames,session)>0 && <p className="warning-banner">{gamesAfterTarget(previewGames,session)} leikir eru skráðir eftir að sigurmarki setts var náð. Þeir haldast í þessu setti. Fyrsta liðið sem náði markinu fær settsigurinn.</p>}
          <div className="history-actions"><button disabled={busy} onClick={()=>setConfirm(false)}>Til baka</button><button className="primary" disabled={busy} onClick={()=>void run(async()=>{await saveGameEdit(sessionId,snapshot,deleting?{deleteGameId:edit.gameId!}:edit,reason);reset()})}>{busy?'Vista…':'Staðfesta breytingu'}</button></div>
        </div>}
      </div> : <>
        {data.snapshots.map(s=><section className="history-set" key={s.set.id}><div className="history-set-heading"><h3>Sett {s.set.setNo} · {s.set.winningTeamId?`${teamName(s.set.winningTeamId)} vann`:'Enginn settsigur'}</h3>{!data.frozen && <button disabled={busy} onClick={()=>choose(s)}>＋ Bæta inn leik</button>}</div>
          {gamesAfterTarget(s.games,session)>0 && <p className="warning-banner">Leikir eru skráðir eftir að sigurmarki setts var náð. Yfirfarðu skráninguna; síðari leikir hafa ekki verið færðir.</p>}
          {s.games.filter(g=>g.status==='completed').map(g=><article className="history-game" key={g.id}><div><small>LEIKUR {g.gameNo}</small><strong>{teamName(g.holderTeamId)} – {teamName(g.challengerTeamId)}</strong><span>{historyResult(g,s.goals,teamName,playerName)}</span></div>{!data.frozen && <button disabled={busy} aria-label={`Breyta leik ${g.gameNo} í setti ${s.set.setNo}`} onClick={()=>choose(s,g)}>Breyta</button>}</article>)}
          {!s.games.some(g=>g.status==='completed') && <p>Engir loknir leikir í þessu setti.</p>}
        </section>)}
        {!!session.gameCorrections?.length && <details className="history-audit"><summary>Breytingasaga ({session.gameCorrections.length})</summary>{[...session.gameCorrections].reverse().map((c,i)=><article key={c.id}><strong>{c.description}</strong><p>{c.reason} · {new Date(c.createdAt).toLocaleString('is-IS')}</p>{i===0 && !data.frozen && <button disabled={busy} onClick={()=>{if(window.confirm('Afturkalla nýjustu leiðréttinguna? Aðgerðin stöðvast ef ný skráning hefur breytt settinu.')) void run(()=>reverseGameCorrection(sessionId,c.id))}}>Afturkalla leiðréttingu</button>}</article>)}</details>}
      </>}
    </section></div>}
  </>
}
