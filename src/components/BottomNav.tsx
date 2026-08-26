export type MainView = 'HOME' | 'STATS' | 'ADMIN'

export function BottomNav({ view, onChange }: { view: MainView; onChange: (view: MainView) => void }) {
  return <nav className="bottom-nav">
    <button className={view === 'HOME' ? 'active' : ''} onClick={() => onChange('HOME')}>⌂<span>Heim</span></button>
    <button className={view === 'STATS' ? 'active' : ''} onClick={() => onChange('STATS')}>▥<span>Tölfræði</span></button>
    <button className={view === 'ADMIN' ? 'active' : ''} onClick={() => onChange('ADMIN')}>⚙<span>Stjórnun</span></button>
  </nav>
}
