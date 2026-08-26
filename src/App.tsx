import { useEffect, useState } from 'react'
import { BottomNav, type MainView } from './components/BottomNav'
import { useApp } from './context/AppContext'
import { AdminScreen } from './screens/AdminScreen'
import { HomeScreen } from './screens/HomeScreen'
import { LiveScreen } from './screens/LiveScreen'
import { SessionSetupScreen } from './screens/SessionSetupScreen'
import { SessionSummaryScreen } from './screens/SessionSummaryScreen'
import { StatsScreen } from './screens/StatsScreen'
import './styles.css'

type Route = { type: 'MAIN' } | { type: 'SETUP' } | { type: 'LIVE'; sessionId: string } | { type: 'SUMMARY'; sessionId: string }

type InstallEvent = Event & { prompt: () => Promise<void> }

export default function App() {
  const { state } = useApp()
  const [mainView, setMainView] = useState<MainView>('HOME')
  const [route, setRoute] = useState<Route>({ type: 'MAIN' })
  const [installPrompt, setInstallPrompt] = useState<InstallEvent | null>(null)

  useEffect(() => {
    const handler = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallEvent) }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const routedSession = route.type === 'LIVE' || route.type === 'SUMMARY' ? state.sessions.find((s) => s.id === route.sessionId) : null

  if (route.type === 'SETUP') return <SessionSetupScreen onCancel={() => setRoute({ type: 'MAIN' })} onCreated={(sessionId) => setRoute({ type: 'LIVE', sessionId })} />

  if (route.type === 'LIVE' && routedSession) return <LiveScreen session={routedSession} onSummary={(s) => setRoute({ type: 'SUMMARY', sessionId: s.id })} onFinished={(s) => setRoute({ type: 'SUMMARY', sessionId: s.id })} />
  if (route.type === 'SUMMARY' && routedSession) return <SessionSummaryScreen session={routedSession} onBack={() => setRoute({ type: 'MAIN' })} />

  return <>
    {mainView === 'HOME' && <HomeScreen onNewSession={() => setRoute({ type: 'SETUP' })} onOpenSession={(s) => setRoute({ type: 'LIVE', sessionId: s.id })} onOpenSummary={(s) => setRoute({ type: 'SUMMARY', sessionId: s.id })} />}
    {mainView === 'STATS' && <StatsScreen />}
    {mainView === 'ADMIN' && <AdminScreen />}
    <BottomNav view={mainView} onChange={setMainView} />
    {installPrompt && <button className="install-fab" onClick={async () => { await installPrompt.prompt(); setInstallPrompt(null) }}>＋ Setja app á heimaskjá</button>}
  </>
}
