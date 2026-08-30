import { useEffect, useState } from 'react'
import { BottomNav, type MainRoute } from './components/BottomNav'
import { CloudScreen } from './components/CloudScreen'
import { HomeScreen } from './components/HomeScreen'
import { LiveSessionScreen } from './components/LiveSessionScreen'
import { NewSessionScreen } from './components/NewSessionScreen'
import { PlayersScreen } from './components/PlayersScreen'
import { SessionSummaryScreen } from './components/SessionSummaryScreen'
import { SeasonPresentationScreen } from './components/SeasonPresentationScreen'
import { StatsScreen } from './components/StatsScreen'
import { TeamSetupScreen } from './components/TeamSetupScreen'
import './styles.css'

type Route = { name: MainRoute | 'new' | 'setup' | 'live' | 'summary' | 'presentation'; id?: string }

function parseRoute(): Route {
  const hash = location.hash.replace(/^#\/?/, '')
  const [name, id] = hash.split('/')
  if (['players','stats','cloud','new','setup','live','summary','presentation'].includes(name)) return { name: name as Route['name'], id }
  return { name: 'home' }
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseRoute())
  useEffect(() => { const handler = () => setRoute(parseRoute()); window.addEventListener('hashchange', handler); return () => window.removeEventListener('hashchange', handler) }, [])
  const go = (name: Route['name'], id?: string) => { location.hash = id ? `#/${name}/${id}` : `#/${name}` }
  const main = (name: MainRoute) => go(name)
  const isImmersive = ['new','setup','live','summary','presentation'].includes(route.name)

  return <div className="app-shell">
    <div className="app-content">
      {route.name === 'home' && <HomeScreen onNew={()=>go('new')} onContinue={id=>go('live',id)} onSetup={id=>go('setup',id)} onSummary={id=>go('summary',id)}/>} 
      {route.name === 'players' && <PlayersScreen/>}
      {route.name === 'stats' && <StatsScreen onPresent={year=>go('presentation',String(year))}/>}
      {route.name === 'cloud' && <CloudScreen/>}
      {route.name === 'new' && <NewSessionScreen onCreated={id=>go('setup',id)} onCancel={()=>go('home')}/>} 
      {route.name === 'setup' && route.id && <TeamSetupScreen sessionId={route.id} onReady={()=>go('live',route.id)} onCancel={()=>go('home')}/>} 
      {route.name === 'live' && route.id && <LiveSessionScreen sessionId={route.id} onReshuffle={()=>go('setup',route.id)} onFinish={()=>go('summary',route.id)} onBack={()=>go('home')}/>} 
      {route.name === 'summary' && route.id && <SessionSummaryScreen sessionId={route.id} onBack={()=>go('home')}/>} 
      {route.name === 'presentation' && route.id && <SeasonPresentationScreen seasonYear={Number(route.id)} onBack={()=>go('stats')}/>} 
    </div>
    {!isImmersive && <BottomNav current={route.name as MainRoute} navigate={main}/>} 
  </div>
}
