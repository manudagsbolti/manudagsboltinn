import { useEffect, useLayoutEffect, useState } from 'react'
import { BottomNav, type MainRoute } from './components/BottomNav'
import { CloudScreen } from './components/CloudScreen'
import { HomeScreen } from './components/HomeScreen'
import { HistoricalSessionScreen } from './components/HistoricalSessionScreen'
import { LiveSessionScreen } from './components/LiveSessionScreen'
import { NewSessionScreen } from './components/NewSessionScreen'
import { PlayersScreen } from './components/PlayersScreen'
import { SessionSummaryScreen } from './components/SessionSummaryScreen'
import { SeasonPresentationScreen } from './components/SeasonPresentationScreen'
import { StatsScreen } from './components/StatsScreen'
import { TeamSetupScreen } from './components/TeamSetupScreen'
import { ThemeToggle, type ColorTheme } from './components/ThemeToggle'
import { startAutoSync } from './services/autoSync'
import { AccessGate } from './components/AccessGate'
import { RecorderHome } from './components/RecorderHome'
import { allowedRoute, type AppAccess } from './services/access'
import './styles.css'

type Route = { name: MainRoute | 'new' | 'manual' | 'setup' | 'live' | 'summary' | 'presentation'; id?: string }

function parseRoute(): Route {
  const hash = location.hash.replace(/^#\/?/, '')
  const [name, id] = hash.split('/')
  if (['players','stats','cloud','new','manual','setup','live','summary','presentation'].includes(name)) return { name: name as Route['name'], id }
  return { name: 'home' }
}

export default function App() {
  return <AccessGate>{(access, signOut) => <AppContent access={access} signOut={signOut} />}</AccessGate>
}

function AppContent({ access, signOut }: { access: AppAccess; signOut: () => void }) {
  useEffect(startAutoSync, [])
  const [requestedRoute, setRoute] = useState<Route>(parseRoute())
  const route = allowedRoute(access.role, requestedRoute.name) ? requestedRoute : { name: 'home' as const }
  const recorder = access.role === 'recorder'
  const [theme, setTheme] = useState<ColorTheme>(() => {
    const saved = localStorage.getItem('manudagsboltinn-theme')
    if (saved === 'light' || saved === 'dark') return saved
    return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  })
  useEffect(() => { const handler = () => setRoute(parseRoute()); window.addEventListener('hashchange', handler); return () => window.removeEventListener('hashchange', handler) }, [])
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    localStorage.setItem('manudagsboltinn-theme', theme)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#090c0f' : '#f3f6ee')
  }, [theme])
  const go = (name: Route['name'], id?: string) => { location.hash = id ? `#/${name}/${id}` : `#/${name}` }
  const main = (name: MainRoute) => go(name)
  const isImmersive = ['new','manual','setup','live','summary','presentation'].includes(route.name)

  return <div className="app-shell">
    <div className="app-content">
      {route.name === 'home' && (recorder ? <RecorderHome access={access} go={go} signOut={signOut}/> : <HomeScreen onNew={()=>go('new')} onManual={()=>go('manual')} onContinue={id=>go('live',id)} onSetup={id=>go('setup',id)} onSummary={id=>go('summary',id)}/>)}
      {route.name === 'players' && <PlayersScreen/>}
      {route.name === 'stats' && <StatsScreen onPresent={year=>go('presentation',String(year))}/>}
      {route.name === 'cloud' && <CloudScreen signOut={signOut}/>}
      {route.name === 'new' && (!recorder || (access.playedOn && access.seasonId)) && <NewSessionScreen recordingDate={recorder ? access.playedOn! : undefined} recordingSeasonId={recorder ? access.seasonId! : undefined} onCreated={id=>go('setup',id)} onCancel={()=>go('home')}/>}
      {route.name === 'manual' && <HistoricalSessionScreen onSaved={id=>go('summary',id)} onCancel={()=>go('home')}/>}
      {route.name === 'setup' && route.id && <TeamSetupScreen recorder={recorder} sessionId={route.id} onReady={()=>go('live',route.id)} onCancel={()=>go('home')}/>}
      {route.name === 'live' && route.id && <LiveSessionScreen sessionId={route.id} onReshuffle={()=>go('setup',route.id)} onFinish={()=>go('summary',route.id)} onBack={()=>go('home')}/>}
      {route.name === 'summary' && route.id && <SessionSummaryScreen sessionId={route.id} onBack={()=>go('home')}/>}
      {route.name === 'presentation' && route.id && <SeasonPresentationScreen seasonId={route.id} onBack={()=>go('stats')}/>}
    </div>
    {!isImmersive && !recorder && <BottomNav current={route.name as MainRoute} navigate={main}/>}
    {!isImmersive && <ThemeToggle theme={theme} onChange={setTheme} />}
  </div>
}
