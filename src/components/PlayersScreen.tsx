import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/localDb'
import { addPlayer, ensureSeasonForDate, roleOnDate, setPlayerRole, updatePlayer } from '../data/repository'
import type { Player } from '../domain/types'
import { todayIso } from '../utils/id'
import { SeasonSettings } from './SeasonSettings'

export function PlayersScreen() {
  const players = useLiveQuery(() => db.players.orderBy('name').toArray(), []) ?? []
  const seasons = useLiveQuery(() => db.seasons.toArray(), []) ?? []
  const periods = useLiveQuery(() => db.rolePeriods.toArray(), []) ?? []
  const [effectiveDate, setEffectiveDate] = useState(todayIso())
  const [seasonId, setSeasonId] = useState('')
  useEffect(() => { void ensureSeasonForDate(effectiveDate).catch(() => undefined) }, [effectiveDate])
  const season = seasonId ? seasons.find(item => item.id === seasonId) : seasons.find(item => item.startsOn <= effectiveDate && (!item.endsOn || item.endsOn >= effectiveDate))
  const [editing, setEditing] = useState<Player | null>(null)
  const [name, setName] = useState('')
  const [nickname, setNickname] = useState('')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    if (editing) await updatePlayer(editing.id, { name: name.trim(), nickname: nickname.trim() || null })
    else await addPlayer(name, nickname)
    setName(''); setNickname(''); setEditing(null)
  }

  const edit = (player: Player) => { setEditing(player); setName(player.name); setNickname(player.nickname ?? '') }

  return <section className="screen page-screen">
    <div className="section-heading"><div><span className="eyebrow">HÓPURINN</span><h1>Leikmenn</h1></div><span className="count-badge">{players.filter(p => p.isActive).length} virkir</span></div>
    <SeasonSettings/>
    <label className="field">Önn fyrir stöðu leikmanna<select value={seasonId} onChange={e => setSeasonId(e.target.value)}><option value="">Sjálfvirkt eftir dagsetningu</option>{seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <div className="date-row card"><label>Staða gildir frá</label><input type="date" value={effectiveDate} onChange={event => setEffectiveDate(event.target.value)} /></div>
    <form className="player-form card" onSubmit={submit}>
      <div className="field"><label>Nafn</label><input value={name} onChange={e => setName(e.target.value)} placeholder="T.d. Tóti" /></div>
      <div className="field"><label>Gælunafn <span>valfrjálst</span></label><input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="Ef annað en nafnið" /></div>
      <div className="form-actions"><button className="primary" type="submit">{editing ? 'Vista breytingar' : '+ Bæta við leikmanni'}</button>{editing && <button type="button" onClick={() => { setEditing(null); setName(''); setNickname('') }}>Hætta við</button>}</div>
    </form>
    <div className="stack-list">
      {players.map(player => <article className={`player-row card ${!player.isActive ? 'muted-row' : ''}`} key={player.id}>
        <div className="avatar">{player.name.slice(0, 1).toUpperCase()}</div>
        <div className="grow"><strong>{player.name}</strong>{season && roleOnDate(periods, season.id, player.id, effectiveDate) === 'SUBSTITUTE' && <small className="role-badge">V</small>}{player.nickname && <small>{player.nickname}</small>}</div>
        {season && <button className="text-button" onClick={() => void setPlayerRole(season.id, player.id, roleOnDate(periods, season.id, player.id, effectiveDate) === 'REGULAR' ? 'SUBSTITUTE' : 'REGULAR', effectiveDate)}>{roleOnDate(periods, season.id, player.id, effectiveDate) === 'REGULAR' ? 'Fastamaður' : 'Varamaður'}</button>}
        <button className="text-button" onClick={() => edit(player)}>Breyta</button>
        <button className={`status-toggle ${player.isActive ? 'on' : ''}`} onClick={() => updatePlayer(player.id, { isActive: !player.isActive })}>{player.isActive ? 'Virkur' : 'Óvirkur'}</button>
      </article>)}
      {players.length === 0 && <div className="empty-state"><div>⚽</div><h3>Engir leikmenn enn</h3><p>Bættu hópnum inn hér. Þeir verða síðan valdir í mætingu fyrir hvert kvöld.</p></div>}
    </div>
  </section>
}
