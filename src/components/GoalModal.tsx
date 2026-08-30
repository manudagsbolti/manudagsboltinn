import { useState } from 'react'
import type { Player, SetTeam } from '../domain/types'

export function GoalModal({ team, players, onClose, onSave }: {
  team: SetTeam
  players: Player[]
  onClose: () => void
  onSave: (scorerId: string, assistId: string | null) => Promise<void>
}) {
  const [scorer, setScorer] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const scorerPlayer = players.find(p => p.id === scorer)
  const save = async (assist: string | null) => { if (!scorer || saving) return; setSaving(true); await onSave(scorer, assist) }

  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
    <section className="goal-modal" style={{ '--team-color': team.color } as React.CSSProperties}>
      <div className="modal-grabber"/>
      <header><div><span className="eyebrow">⚽ MARK · {team.name.toUpperCase()}</span><h2>{scorer ? 'Stoðsending?' : 'Hver skoraði?'}</h2></div><button className="modal-close" onClick={onClose}>×</button></header>
      {!scorer ? <div className="player-choice-grid">{players.map(player => <button key={player.id} onClick={() => setScorer(player.id)}><span className="choice-avatar">{player.name[0]}</span><strong>{player.name}</strong></button>)}</div>
      : <>
        <div className="scorer-confirm"><span>Mark</span><strong>⚽ {scorerPlayer?.name}</strong><button onClick={() => setScorer(null)}>Breyta</button></div>
        <div className="assist-label">Veldu stoðsendingu</div>
        <div className="player-choice-grid assists"><button className="no-assist" disabled={saving} onClick={() => void save(null)}><span className="choice-avatar">—</span><strong>Engin</strong></button>{players.filter(p => p.id !== scorer).map(player => <button key={player.id} disabled={saving} onClick={() => void save(player.id)}><span className="choice-avatar">{player.name[0]}</span><strong>{player.name}</strong></button>)}</div>
      </>}
    </section>
  </div>
}
