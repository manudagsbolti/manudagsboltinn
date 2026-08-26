import type { Session } from '../domain/types'
import { SessionStatsBlock } from './LiveScreen'

export function SessionSummaryScreen({ session, onBack }: { session: Session; onBack: () => void }) {
  return <main className="page summary-page">
    <header className="page-header"><div><p className="eyebrow">LOKAYFIRLIT</p><h1>Boltkvöld</h1></div><button className="ghost small" onClick={onBack}>← Til baka</button></header>
    <section className="summary-sheet"><SessionStatsBlock session={session} /></section>
    <button className="primary full" onClick={onBack}>Til baka á heim</button>
  </main>
}
