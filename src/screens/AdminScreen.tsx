import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { RoleBadge } from '../components/RoleBadge'
import { roleAtDate } from '../domain/roles'
import type { PlayerRole } from '../domain/types'
import { playBuzzer, unlockAudio } from '../lib/sound'

export function AdminScreen() {
  const { state, selectedSeason, setSelectedSeason, addPlayer, updatePlayer, addSeason, setPlayerRole, cloudReady, authSession, login, logout, syncing, syncNow, pullCloud } = useApp()
  const [playerText, setPlayerText] = useState('')
  const [seasonName, setSeasonName] = useState('')
  const [seasonStart, setSeasonStart] = useState('')
  const [seasonEnd, setSeasonEnd] = useState('')
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  const roster = useMemo(() => state.players.filter((p) => p.active).slice().sort((a,b) => a.name.localeCompare(b.name, 'is')), [state.players])
  const regularCount = selectedSeason ? roster.filter((p) => roleAtDate(state.rolePeriods, selectedSeason.id, p.id, effectiveDate) === 'REGULAR').length : 0

  function addPlayers() {
    const names = playerText.split(/\n|,/).map((x) => x.trim()).filter(Boolean)
    for (const name of names) {
      if (!state.players.some((p) => p.name.toLocaleLowerCase('is') === name.toLocaleLowerCase('is'))) addPlayer(name)
    }
    setPlayerText('')
  }

  function createSeason() {
    if (!seasonName.trim() || !seasonStart || !seasonEnd) return
    addSeason({ name: seasonName.trim(), startDate: seasonStart, endDate: seasonEnd })
    setEffectiveDate(seasonStart)
    setSeasonName(''); setSeasonStart(''); setSeasonEnd('')
  }

  async function doLogin() {
    try { await login(email, password); setPassword(''); setMessage('Innskráning tókst.') } catch (e) { setMessage(e instanceof Error ? e.message : String(e)) }
  }

  async function action(fn: () => Promise<void>, success: string) {
    try { await fn(); setMessage(success) } catch (e) { setMessage(e instanceof Error ? e.message : String(e)) }
  }

  return <main className="page page-with-nav admin-page">
    <header className="page-header"><div><p className="eyebrow">STJÓRNUN</p><h1>Uppsetning</h1></div></header>

    <section className="admin-card">
      <div className="section-heading"><h2>Ský & sync</h2><span>{cloudReady ? 'Supabase' : 'Local only'}</span></div>
      {!cloudReady ? <p className="muted">Settu VITE_SUPABASE_URL og VITE_SUPABASE_PUBLISHABLE_KEY í <code>.env.local</code> til að virkja skýið. Appið virkar samt fullkomlega local.</p> : !authSession ? <>
        <div className="form-grid"><label className="field"><span>Netfang</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label><label className="field"><span>Lykilorð</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label></div>
        <button className="primary" onClick={doLogin}>Skrá inn</button>
      </> : <>
        <p className="muted">Innskráð sem <strong>{authSession.user.email}</strong></p>
        <div className="button-row"><button className="primary" disabled={syncing} onClick={() => action(syncNow, 'Sync lokið.')}>{syncing ? 'Sync…' : '↑ Sync núna'}</button><button className="secondary" disabled={syncing} onClick={() => action(pullCloud, 'Gögn sótt úr skýi.')}>↓ Sækja úr skýi</button><button className="ghost" onClick={logout}>Útskrá</button></div>
      </>}
      {message && <p className="status-message">{message}</p>}
    </section>

    <section className="admin-card">
      <div className="section-heading"><h2>Önn</h2><span>{state.seasons.length}</span></div>
      {state.seasons.length > 0 && <label className="field"><span>Virk önn í viðmóti</span><select value={selectedSeason?.id ?? ''} onChange={(e) => { setSelectedSeason(e.target.value); const s = state.seasons.find((x) => x.id === e.target.value); if (s) setEffectiveDate(s.startDate) }}>{state.seasons.slice().sort((a,b) => b.startDate.localeCompare(a.startDate)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
      <details className="details-box"><summary>＋ Stofna nýja önn</summary><div className="details-content"><label className="field"><span>Nafn</span><input placeholder="2026 Haust" value={seasonName} onChange={(e) => setSeasonName(e.target.value)} /></label><div className="form-grid"><label className="field"><span>Frá</span><input type="date" value={seasonStart} onChange={(e) => setSeasonStart(e.target.value)} /></label><label className="field"><span>Til</span><input type="date" value={seasonEnd} onChange={(e) => setSeasonEnd(e.target.value)} /></label></div><button className="primary" onClick={createSeason}>Stofna önn</button></div></details>
    </section>

    <section className="admin-card">
      <div className="section-heading"><h2>Leikmenn & staða</h2><span>{selectedSeason ? `${regularCount} fastamenn` : `${roster.length} leikmenn`}</span></div>
      <label className="field"><span>Bæta við leikmönnum</span><textarea rows={3} placeholder={'Eitt nafn í línu\nEða mörg nöfn í einu'} value={playerText} onChange={(e) => setPlayerText(e.target.value)} /></label>
      <button className="secondary" onClick={addPlayers}>＋ Bæta við</button>
      {selectedSeason && <>
        <label className="field compact role-date"><span>Staða gildir frá</span><input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} /></label>
        <p className="muted small-text">Fastamaður/varamaður er tímabundin staða. Hvert boltakvöld tekur snapshot svo eldri tölfræði breytist ekki.</p>
      </>}
      <div className="roster-admin-list">{roster.map((player) => {
        const role: PlayerRole = selectedSeason ? roleAtDate(state.rolePeriods, selectedSeason.id, player.id, effectiveDate) : 'SUBSTITUTE'
        return <div className="roster-admin-row" key={player.id}><div><strong>{player.name}</strong>{player.nickname && <span>{player.nickname}</span>}</div>{selectedSeason && <div className="role-toggle"><button className={role === 'REGULAR' ? 'active' : ''} onClick={() => setPlayerRole(selectedSeason.id, player.id, 'REGULAR', effectiveDate)}>F</button><button className={role === 'SUBSTITUTE' ? 'active' : ''} onClick={() => setPlayerRole(selectedSeason.id, player.id, 'SUBSTITUTE', effectiveDate)}>V</button></div>}<RoleBadge role={role}/><button className="icon-button" title="Gera óvirkan" onClick={() => updatePlayer(player.id, { active: false })}>×</button></div>
      })}</div>
    </section>

    <section className="admin-card"><h2>Leikklukka</h2><p className="muted">Prófaðu hljóðið á þeim síma sem verður notaður áður en boltinn byrjar.</p><button className="secondary" onClick={async () => { await unlockAudio(); await playBuzzer() }}>🔊 Prófa lokahljóð</button></section>
  </main>
}
