import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/localDb'
import { addPlayer, createSession, roleOnDate, updateDraftRoster } from '../data/repository'
import { DEFAULT_RULES } from '../domain/rules'
import { todayIso } from '../utils/id'
import { defaultSeasonForDate, uniqueSeasonForDate } from '../domain/seasons'
import { SeasonContext } from './SeasonContext'

export function NewSessionScreen({ onCreated, onCancel, recordingDate, recordingSeasonId, recorder = false, edit }: { onCreated: (id: string) => void; onCancel: () => void; recordingDate?: string; recordingSeasonId?: string; recorder?: boolean; edit?: { sessionId: string; playerIds: string[]; playedOn: string; seasonId: string | null } }) {
  const players = useLiveQuery(() => db.players.toArray().then(rows => rows.filter(p => p.isActive || edit?.playerIds.includes(p.id))), [edit?.sessionId]) ?? []
  const rolePeriods = useLiveQuery(() => db.rolePeriods.toArray(), []) ?? []
  const seasons = useLiveQuery(() => db.seasons.toArray(), []) ?? []
  const rosterCache = useLiveQuery(() => db.ratingCache.toArray(), []) ?? []
  const [selected, setSelected] = useState<Set<string>>(new Set(edit?.playerIds ?? []))
  const [date, setDate] = useState(edit?.playedOn ?? recordingDate ?? todayIso())
  const [seasonId, setSeasonId] = useState(edit?.seasonId ?? recordingSeasonId ?? '')
  const [busy, setBusy] = useState(false)
  const [assistsEnabled, setAssistsEnabled] = useState(true)
  const [error, setError] = useState('')
  const [quickName, setQuickName] = useState('')
  const selectedCount = selected.size
  const season = defaultSeasonForDate(date)
  const persistedSeason = seasonId ? seasons.find(item => item.id === seasonId) : uniqueSeasonForDate(seasons, date)
  const cachedSeason = uniqueSeasonForDate(rosterCache.map(r => r.season), date)
  const cachedRoster = rosterCache.find(r => r.id === cachedSeason?.id)
  const roleSeason = recorder ? cachedSeason : persistedSeason
  const knownRoles = !!roleSeason && (!recorder || cachedRoster?.rolePeriods !== undefined) && roleSeason.startsOn <= date && (!roleSeason.endsOn || roleSeason.endsOn >= date)
  const role = (playerId: string) => knownRoles ? roleOnDate(recorder ? cachedRoster!.rolePeriods! : rolePeriods, roleSeason!.id, playerId, date) : null
  const sorted = useMemo(() => [...players].sort((a,b) => a.name.localeCompare(b.name, 'is')), [players])
  const groups = knownRoles ? [
    { title: 'Fastamenn', id: 'regular', rows: sorted.filter(p => role(p.id) === 'REGULAR') },
    { title: 'Varamenn', id: 'substitute', rows: sorted.filter(p => role(p.id) === 'SUBSTITUTE') },
  ] : [{ title: 'Leikmenn · staða óákveðin', id: 'unknown', rows: sorted }]

  const toggle = (id: string) => setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  const quickAdd = async () => {
    if (!quickName.trim()) return
    const player = await addPlayer(quickName)
    setSelected(prev => new Set(prev).add(player.id))
    setQuickName('')
  }
  const next = async () => {
    if (selectedCount < 4 || busy) return
    setBusy(true); setError('')
    try {
    if (edit) { await updateDraftRoster(edit.sessionId, [...selected]); onCreated(edit.sessionId); return }
    if (recordingDate && !persistedSeason) throw new Error('Sæktu kvöldið á forsíðunni áður en mæting er valin.')
    const session = await createSession({ assistsEnabled, seasonId: persistedSeason?.id, playedOn: date, playerIds: [...selected], gameDurationSeconds: DEFAULT_RULES.gameDurationSeconds, winsPerPoint: DEFAULT_RULES.winsPerPoint, pointsToWinSet: DEFAULT_RULES.pointsToWinSet })
    onCreated(session.id)
    } catch (e) { setError(e instanceof Error ? e.message : 'Vistun mistókst.') } finally { setBusy(false) }
  }

  return <section className="screen page-screen wizard-screen">
    <button className="back-button" disabled={busy} onClick={onCancel}>← {edit ? 'Hætta við breytingar' : 'Til baka'}</button>
    <div className="section-heading"><div><span className="eyebrow">{edit ? 'BREYTA HÓPNUM' : 'NÝR LEIKDAGUR'}</span><h1>Hverjir mæta?</h1></div><span className="count-badge accent">{selectedCount} valdir</span></div>
    {edit ? <p>Bættu við eða taktu leikmenn úr hópnum. Sama kvöld og dagsetning haldast.</p> : recorder ? <><label className="field">Dagsetning kvöldsins<input required type="date" value={date} onChange={e => setDate(e.target.value)} /></label><p>Stjórnandi velur önn og staðfestir fastamanns-/varamannsstöður við yfirferð.</p></> : recordingDate ? <p>Dagsetning: {recordingDate}</p> : <>
      <div className="date-row card"><div><label>Dagsetning</label><small className="season-inline">Tímabil {persistedSeason?.name ?? season?.name ?? 'Sumarfrí'}</small></div><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
      <label className="field">Önn<select value={seasonId} onChange={e => setSeasonId(e.target.value)}><option value="">Sjálfvirkt eftir dagsetningu</option>{seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    </>}
    {!recorder && !recordingDate && <SeasonContext date={date} seasonId={seasonId} />}
    {error && <p role="alert" className="warning-banner">{error}</p>}
    <p className="setup-hint">{knownRoles ? `Staða miðast við ${roleSeason!.name} og leikdaginn ${date}.` : recorder ? 'Leikmannastöður hafa ekki verið sóttar fyrir þessa dagsetningu. Þú getur samt valið hópinn; „Athuga tengingu“ á forsíðunni sækir stöðurnar.' : 'Veldu önn sem nær yfir leikdaginn til að sjá fastamenn og varamenn.'}</p>
    {groups.map(group => {
      const count = group.rows.filter(p => selected.has(p.id)).length
      const all = group.rows.length > 0 && count === group.rows.length
      return <section className="attendance-group" key={group.id} aria-labelledby={`attendance-${group.id}`}>
        <header className="attendance-group-heading"><div><h2 id={`attendance-${group.id}`}>{group.title}</h2><small>{count} af {group.rows.length} valdir</small></div>
          {group.id === 'regular' && <button className="recorder-button" disabled={!group.rows.length || busy} onClick={() => setSelected(prev => { const next = new Set(prev); for (const p of group.rows) { if (all) next.delete(p.id); else next.add(p.id) } return next })}>{all ? 'Afvelja alla fastamenn' : 'Velja alla fastamenn'}</button>}
        </header>
        {!group.rows.length && <p className="setup-hint">Engir leikmenn í þessum hópi.</p>}
        <div className="attendance-grid">{group.rows.map(player => <button disabled={busy} aria-pressed={selected.has(player.id)} key={player.id} className={`attendance-player ${selected.has(player.id) ? 'selected' : ''}`} onClick={() => toggle(player.id)}>
          <span className="checkmark" aria-hidden="true">{selected.has(player.id) ? '✓' : ''}</span>
          <span className="attendance-identity"><strong>{player.name}</strong>{player.nickname && <small>{player.nickname}</small>}</span>
          {knownRoles && <span className="attendance-role" title={group.id === 'regular' ? 'Fastamaður' : 'Varamaður'} aria-label={group.id === 'regular' ? 'Fastamaður' : 'Varamaður'}>{group.id === 'regular' ? 'F' : 'V'}</span>}
        </button>)}</div>
      </section>
    })}
    <div className="quick-add card"><input value={quickName} onChange={e => setQuickName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void quickAdd() } }} placeholder="Nýr leikmaður sem mætti í kvöld..."/><button onClick={() => void quickAdd()}>+ Bæta við</button></div>
    <p className="setup-hint">{recorder ? 'Nýr leikmaður vistast á þessu tæki og verður valinn í hópinn. Hann fer í sameiginlegu leikmannaskrána þegar stjórnandi samþykkir kvöldið.' : 'Nýr leikmaður vistast í leikmannaskrá og verður valinn í hópinn. Hann er varamaður þar til fastamannsstaða er skráð.'}</p>
    <div className="rules-card card">Leikir eru 03:00 · Fyrsta lið í 4 sigra vinnur sett.</div>
    {!edit && <div className="card assist-setting"><button type="button" role="switch" aria-checked={assistsEnabled} disabled={busy} onClick={()=>setAssistsEnabled(!assistsEnabled)}>Stoðsendingaskráning: {assistsEnabled?'Kveikt':'Slökkt'}</button><p>Þegar slökkt er á skráningu vistast markið strax eftir val á markaskorara. Má breyta aftur á leikskjánum.</p></div>}
    <div className="sticky-action"><button className="primary jumbo" disabled={busy || selectedCount < 4} onClick={() => void next()}>Áfram <span>→</span></button><small>{selectedCount < 4 ? 'Veldu a.m.k. 4 leikmenn' : `Næst: staðfesta ${selectedCount} manna hóp og skipta í lið`}</small></div>
  </section>
}
