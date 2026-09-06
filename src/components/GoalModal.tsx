import { useState } from 'react'
import type { Player, SetTeam } from '../domain/types'

export function GoalModal({ team, players, defendingPlayers, onClose, onSave }: {
  team: SetTeam
  players: Player[]
  defendingPlayers: Player[]
  onClose: () => void
  onSave: (scorerId: string, assistId: string | null, eventType: 'GOAL' | 'OWN_GOAL') => Promise<void>
}) {
  const [scorer, setScorer] = useState<string | null>(null)
  const [ownGoal, setOwnGoal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const choices = ownGoal ? defendingPlayers : players
  const scorerPlayer = choices.find(player => player.id === scorer)
  const save = async (assist: string | null) => {
    if (!scorer || saving) return
    setSaving(true)
    try { await onSave(scorer, assist, ownGoal ? 'OWN_GOAL' : 'GOAL') }
    catch { setError('Markið vistaðist ekki. Reyndu aftur.'); setSaving(false) }
  }

  return <div className="modal-backdrop" onMouseDown={event => { if (!saving && event.target === event.currentTarget) onClose() }}>
    <section className="goal-modal" role="dialog" aria-modal="true" aria-label="Skrá mark" style={{ '--team-color': team.color } as React.CSSProperties}>
      {error && <p role="alert">{error}</p>}
      <div className="modal-grabber" />
      <header><div><span className="eyebrow">⚽ MARK · {team.name.toUpperCase()}</span><h2>{scorer ? (ownGoal ? 'Staðfesta sjálfsmark' : 'Stoðsending?') : (ownGoal ? 'Hver gerði sjálfsmark?' : 'Hver skoraði?')}</h2></div><button className="modal-close" onClick={onClose}>×</button></header>
      {!scorer ? <>
        <button className="text-button" onClick={() => setOwnGoal(!ownGoal)}>{ownGoal ? '← Venjulegt mark' : 'Sjálfsmark'}</button>
        <div className="player-choice-grid">{choices.map(player => <button key={player.id} onClick={() => setScorer(player.id)}><span className="choice-avatar">{player.name[0]}</span><strong>{player.name}</strong></button>)}</div>
      </> : <>
        <div className="scorer-confirm"><span>{ownGoal ? 'Sjálfsmark' : 'Mark'}</span><strong>⚽ {scorerPlayer?.name}</strong><button onClick={() => setScorer(null)}>Breyta</button></div>
        {ownGoal ? <button className="primary jumbo" disabled={saving} onClick={() => void save(null)}>Vista sjálfsmark</button> : <>
          <div className="assist-label">Veldu stoðsendingu</div>
          <div className="player-choice-grid assists"><button className="no-assist" disabled={saving} onClick={() => void save(null)}><span className="choice-avatar">—</span><strong>Engin</strong></button>{players.filter(player => player.id !== scorer).map(player => <button key={player.id} disabled={saving} onClick={() => void save(player.id)}><span className="choice-avatar">{player.name[0]}</span><strong>{player.name}</strong></button>)}</div>
        </>}
      </>}
    </section>
  </div>
}
