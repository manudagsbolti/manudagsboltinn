import { ClubWelcome } from './ClubBrand'
import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { loadAccess, RECORDER_EMAIL, signOutSafely, type AppAccess } from '../services/access'
import { syncCloud } from '../services/cloudSync'

export function AccessGate({ children }: { children: (access: AppAccess, signOut: () => void) => ReactNode }) {
  const [access, setAccess] = useState<AppAccess | null>(null)
  const [loading, setLoading] = useState(true)
  const [admin, setAdmin] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    void loadAccess().then(value => { if (active) setAccess(value) })
      .catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) })
    const changed = (event: StorageEvent) => { if (event.key === 'manudagsboltinn-access') window.location.reload() }
    window.addEventListener('storage', changed)
    return () => { active = false; window.removeEventListener('storage', changed) }
  }, [])
  const login = async () => {
    if (!supabase) return
    setBusy(true); setError('')
    try {
      const { error: failure } = await supabase.auth.signInWithPassword({ email: admin ? email.trim() : RECORDER_EMAIL, password })
      if (failure) throw new Error('Innskráning tókst ekki. Athugaðu lykilorðið og reyndu aftur.')
      const next = await loadAccess(admin ? 'admin' : 'recorder')
      if (!next || (!admin && next.role !== 'recorder')) throw new Error('Röng aðgangsheimild fyrir skráningu.')
      setPassword('')
      // Initial roster download is outside the live loop. If it fails, cached
      // operational data remains available and the screen offers a retry.
      try { await syncCloud() } catch { /* retry from the home/sync screen */ }
      setAccess(next)
    } catch (e) { setError(e instanceof Error ? e.message : 'Ekki náðist samband. Reyndu aftur.') }
    finally { setBusy(false) }
  }
  const logout = async () => {
    try { await signOutSafely(); setAccess(null); setError('') }
    catch (e) { setError(e instanceof Error ? e.message : 'Útskráning mistókst.') }
  }
  if (!supabase && import.meta.env.DEV) return children({ role: 'admin', userId: 'local-development' }, () => undefined)
  if (loading) return <main className="screen loading-screen">Opna Mánudagsboltann…</main>
  if (access) return <>{error && <p role="alert" className="warning-banner">{error}</p>}{children(access, () => { void logout() })}</>
  return <main className="screen page-screen access-screen">
    <form className="card auth-card" onSubmit={e => { e.preventDefault(); void login() }}>
      <ClubWelcome/><span className="eyebrow">MÁNUDAGSBOLTINN</span><h1>{admin ? 'Stjórnandi' : 'Skrá boltakvöld'}</h1>
      <p>{admin ? 'Notaðu þinn stjórnandaaðgang.' : 'Sláðu inn sameiginlega lykilorðið til að skrá kvöldið.'}</p>
      {admin && <label className="field">Netfang<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></label>}
      <label className="field">Lykilorð<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
      {error && <p role="alert">{error}</p>}
      {!supabase && <p role="alert">Tenging er ekki tilbúin. Hafðu samband við stjórnanda.</p>}
      <button className="primary jumbo" disabled={busy || !supabase}>{busy ? 'Opna…' : 'Opna'}</button>
      <button type="button" className="text-button" onClick={() => { setAdmin(!admin); setPassword(''); setError('') }}>{admin ? 'Til baka í skráningu' : 'Stjórnandaaðgangur'}</button>
    </form>
  </main>
}
