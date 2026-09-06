import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Session as AuthSession } from '@supabase/supabase-js'
import { db } from '../db/localDb'
import { hasSupabaseConfig, supabase } from '../lib/supabase'
import { syncCloud } from '../services/cloudSync'
import { exportBackup, restoreBackup } from '../services/backup'
import { RecordingAccess } from './RecordingAccess'

export function CloudScreen({ signOut }: { signOut: () => void }) {
  const queued = useLiveQuery(() => db.syncQueue.count(), []) ?? 0
  const syncError = useLiveQuery(() => db.syncQueue.filter(item => item.attempts > 0).first(), [])
  const [auth, setAuth] = useState<AuthSession | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [working, setWorking] = useState(false)

  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => setAuth(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setAuth(session))
    return () => data.subscription.unsubscribe()
  }, [])

  const signIn = async () => {
    if (!supabase) return
    setWorking(true); setMessage('')
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      setMessage(error ? error.message : 'Tengdur.')
      if (!error) setPassword('')
    } catch { setMessage('Innskráning mistókst. Athugaðu netsamband og reyndu aftur.') }
    finally { setWorking(false) }
  }
  const restore = async (file: File | undefined) => {
    if (!file) return
    if (!confirm('Restore mun skipta út local gögnum í appinu fyrir gögnin í backup-skránni. Halda áfram?')) return
    setWorking(true); setMessage('')
    try { const result = await restoreBackup(file); setMessage(`Backup endurheimt · ${result.players} leikmenn · ${result.sessions} kvöld · ${result.goals} mörk`) }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
    finally { setWorking(false) }
  }
  const sync = async () => {
    setWorking(true); setMessage('')
    try {
      const result = await syncCloud()
      setMessage(result.deferredPull
        ? 'Breytingar urðu á tækinu meðan samstillt var. Þær eru varðveittar; sæktu aftur þegar hlé er á skráningu.'
        : `Sync lokið · ${result.pushed} sent · ${result.pulled} sótt`)
    }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
    finally { setWorking(false) }
  }

  return <section className="screen page-screen cloud-screen">
    <div className="section-heading"><div><span className="eyebrow">OFFLINE-FIRST</span><h1>Cloud sync</h1></div><span className={`sync-status ${auth ? 'ok' : ''}`}>{auth ? '● Tengdur' : '○ Local'}</span></div>
    <article className="cloud-hero card"><div className="cloud-icon">☁</div><div><h2>Leikurinn þarf ekki net</h2><p>Öll skráning fer fyrst í símann. Þegar samband er til staðar getur appið samstillt gögnin við Supabase.</p></div></article>
    {!hasSupabaseConfig ? <div className="setup-box card"><h3>Supabase ekki tengt enn</h3><p>Bættu <code>VITE_SUPABASE_URL</code> og <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> í <code>.env.local</code>. Appið heldur áfram að virka locally án þess.</p></div>
    : !auth ? <div className="auth-card card"><h3>Tengjast Mánudagsboltanum</h3><p>Notaðu stjórnandaaðganginn sem var stofnaður fyrir þig.</p><div className="field"><label>Netfang</label><input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} /></div><div className="field"><label>Lykilorð</label><input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} /></div><button className="primary" disabled={working||!email||!password} onClick={()=>void signIn()}>Skrá inn</button></div>
    : <div className="sync-card card"><div><small>Tengdur sem</small><strong>{auth.user.email}</strong></div><div className="queue-count"><b>{queued}</b><span>breytingar í bið</span></div><button className="primary jumbo" disabled={working} onClick={()=>void sync()}>{working?'Samstilli…':'↻ Sync núna'}</button><button className="text-button" onClick={signOut}>Skrá út</button></div>}
    {auth && <RecordingAccess />}
    <div className="backup-card card"><div><span className="eyebrow">ÖRYGGISAFRIT</span><h3>Dumpa öllum gögnum</h3><p>Gerðu þetta fyrir update eða fyrir leikdag ef þú vilt vera alveg öruggur. Backup inniheldur allt raw leikjagagnasafnið.</p></div><div className="backup-actions"><button className="primary" onClick={()=>void exportBackup()}>↓ Export backup</button><label className="restore-button">↑ Restore backup<input type="file" accept="application/json,.json" disabled={working} onChange={e=>void restore(e.target.files?.[0])}/></label></div></div>
    {message && <div className="sync-message">{message}</div>}
    {syncError && <div className="sync-message" role="status">Samstilling mistókst. Gögn eru örugg á tækinu og bíða næstu tilraunar.</div>}
    <div className="cloud-notes"><h3>Hvernig þetta virkar</h3><div><b>1</b><span>Allt vistast strax í IndexedDB á tækinu.</span></div><div><b>2</b><span>Breytingar fara í sync queue án þess að hægja á leiknum.</span></div><div><b>3</b><span>Supabase verður sameiginlega gagnasafnið þegar þú tengir aðgang.</span></div></div>
  </section>
}
