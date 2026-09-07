export type MainRoute = 'home' | 'players' | 'seasons' | 'stats' | 'cloud'

export function BottomNav({ current, navigate }: { current: MainRoute; navigate: (route: MainRoute) => void }) {
  const items: { route: MainRoute; icon: string; label: string }[] = [
    { route: 'home', icon: '⌂', label: 'Heim' },
    { route: 'players', icon: '♟', label: 'Leikmenn' },
    { route: 'seasons', icon: '▦', label: 'Annir og kvöld' },
    { route: 'stats', icon: '▥', label: 'Tölfræði' },
    { route: 'cloud', icon: '☁', label: 'Sync' },
  ]
  return <nav className="bottom-nav" aria-label="Aðalleiðsögn">{items.map((item) => (
    <button key={item.route} className={current === item.route ? 'active' : ''} aria-current={current === item.route ? 'page' : undefined} onClick={() => navigate(item.route)}>
      <span>{item.icon}</span><small>{item.label}</small>
    </button>
  ))}</nav>
}
