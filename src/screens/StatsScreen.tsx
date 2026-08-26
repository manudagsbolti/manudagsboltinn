import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { pairStats, seasonPlayerStats } from '../domain/stats'
import type { PlayerRole } from '../domain/types'

export function StatsScreen() {
  const { state, selectedSeason, setSelectedSeason } = useApp()
  const [filter, setFilter] = useState<PlayerRole | 'ALL'>('REGULAR')
  const rows = useMemo(() => selectedSeason ? seasonPlayerStats(state, selectedSeason.id, filter) : [], [state, selectedSeason, filter])
  const pairs = useMemo(() => selectedSeason ? pairStats(state, selectedSeason.id, filter).filter((p) => p.miniGames >= 5).slice(0, 12) : [], [state, selectedSeason, filter])

  return <main className="page page-with-nav">
    <header className="page-header"><div><p className="eyebrow">TÖLFRÆÐI</p><h1>Staðan</h1></div></header>
    {state.seasons.length > 0 && <label className="field compact"><span>Önn</span><select value={selectedSeason?.id ?? ''} onChange={(e) => setSelectedSeason(e.target.value)}>{state.seasons.slice().sort((a,b) => b.startDate.localeCompare(a.startDate)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
    <div className="segmented stats-filter"><button className={filter === 'REGULAR' ? 'active' : ''} onClick={() => setFilter('REGULAR')}>Fastamenn</button><button className={filter === 'SUBSTITUTE' ? 'active' : ''} onClick={() => setFilter('SUBSTITUTE')}>Varamenn</button><button className={filter === 'ALL' ? 'active' : ''} onClick={() => setFilter('ALL')}>Allir</button></div>

    {!selectedSeason || !rows.length ? <section className="empty-card"><h2>Engin tölfræði enn</h2><p>Tölfræðin verður til sjálfkrafa þegar boltakvöld eru skráð.</p></section> : <>
      <section className="section-block">
        <div className="section-heading"><h2>{filter === 'REGULAR' ? 'Innri keppni fastamanna' : filter === 'SUBSTITUTE' ? 'Varamenn' : 'Allir leikmenn'}</h2><span>{rows.length}</span></div>
        <div className="stats-table-wrap"><table className="stats-table season-table"><thead><tr><th>#</th><th>Leikmaður</th><th>Kvöld</th>{filter === 'REGULAR' && <th>Mæting</th>}<th>Leikir</th><th>Sigrar</th><th>Sett</th><th>Mörk</th><th>Assist</th><th>G+A</th><th>Win%</th><th>Choke</th><th>Nix</th></tr></thead><tbody>{rows.map((p, i) => <tr key={p.playerId}><td>{i + 1}</td><td>{p.playerName}</td><td>{p.appearances}</td>{filter === 'REGULAR' && <td>{Math.round(p.attendancePct * 100)}%</td>}<td>{p.miniGames}</td><td>{p.wins}</td><td><strong>{p.sets}</strong></td><td>{p.goals}</td><td>{p.assists}</td><td>{p.goalContributions}</td><td>{Math.round(p.winPct * 100)}%</td><td>{p.chokes}</td><td>{p.nix}</td></tr>)}</tbody></table></div>
      </section>

      <section className="section-block">
        <div className="section-heading"><h2>Bestu pörin</h2><span>min. 5 leikir</span></div>
        {pairs.length ? <div className="pair-list">{pairs.map((p) => <div className="pair-row" key={p.key}><div><strong>{p.player1Name} + {p.player2Name}</strong><span>{p.appearancesTogether} kvöld · {p.miniGames} leikir · {p.sets} sett</span></div><strong>{Math.round(p.winPct * 100)}%</strong></div>)}</div> : <p className="muted">Of lítið gagnamagn enn.</p>}
      </section>
    </>}
  </main>
}
