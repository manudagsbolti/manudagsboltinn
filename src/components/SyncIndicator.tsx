import { useApp } from '../context/AppContext'

export function SyncIndicator() {
  const { state, online, syncing, cloudReady, authSession } = useApp()
  let label = 'Local'
  let cls = 'local'
  if (!online) { label = 'Offline'; cls = 'offline' }
  else if (!cloudReady) { label = 'Local only'; cls = 'local' }
  else if (!authSession) { label = 'Ekki innskráð'; cls = 'warning' }
  else if (syncing) { label = 'Sync…'; cls = 'syncing' }
  else if (state.sync.pending) { label = 'Bíður sync'; cls = 'warning' }
  else { label = 'Synced'; cls = 'ok' }
  return <span className={`sync-pill ${cls}`} title={state.sync.lastError ?? undefined}>{label}</span>
}
