export type MainRoute = 'home' | 'players' | 'stats' | 'cloud'

export function BottomNav({ current, navigate }: { current: MainRoute; navigate: (route: MainRoute) => void }) {
  const items: { route: MainRoute; icon: string; label: string }[] = [
    { route: 'home', icon: '⌂', label: 'Heim' },
    { route: 'players', icon: '♟', label: 'Leikmenn' },
    { route: 'stats', icon: '▥', label: 'Tölfræði' },
    { route: 'cloud', icon: '☁', label: 'Sync' },
  ]
  return <nav className="bottom-nav">{items.map((item) => (
    <button key={item.route} className={current === item.route ? 'active' : ''} onClick={() => navigate(item.route)}>
      <span>{item.icon}</span><small>{item.label}</small>
    </button>
  ))}</nav>
}
