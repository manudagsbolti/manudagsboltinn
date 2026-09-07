import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/localDb'
import { queueSubmission } from '../services/submissions'
import { flushSyncQueue } from '../services/syncQueue'

export function SubmitNight({ sessionId }: { sessionId: string }) {
  const submission = useLiveQuery(() => db.submissions.get(sessionId), [sessionId])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <section className="card season-context"><h2>Yfirferð kvöldsins</h2>
    <p role="status">{submission ? { queued: 'Bíður sendingar á tækinu. Sendist þegar nettenging fæst.', pending: 'Sent · bíður samþykktar stjórnanda.', approved: 'Samþykkt af stjórnanda.', rejected: 'Stjórnandi hafnaði skráningunni.' }[submission.state] : 'Kvöldið telur í annartölfræði eftir samþykkt stjórnanda. Leikmannastöður verða staðfestar við yfirferð.'}</p>
    {!submission && <button className="primary jumbo" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await queueSubmission(sessionId); void flushSyncQueue().catch(() => undefined) } catch (e) { setError(e instanceof Error ? e.message : 'Sending mistókst.') } finally { setBusy(false) } }}>Senda til yfirferðar</button>}
    {error && <p role="alert">{error}</p>}
  </section>
}
