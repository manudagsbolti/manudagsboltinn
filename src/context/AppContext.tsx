import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session as AuthSession } from '@supabase/supabase-js'
import type { AppState, Player, PlayerRole, Season, Session } from '../domain/types'
import { recoverSession } from '../domain/gameEngine'
import { setRoleFromDate } from '../domain/roles'
import { cloudConfigured, getAuthSession, pullFromCloud, pushAllToCloud, signIn, signOut } from '../lib/cloud'
import { clearUndo, loadAppState, loadUndo, replaceLocalState, saveAppState, saveUndo } from '../lib/storage'

interface AppContextValue {
  state: AppState
  hydrated: boolean
  online: boolean
  authSession: AuthSession | null
  cloudReady: boolean
  syncing: boolean
  activeSession: Session | null
  selectedSeason: Season | null
  setSelectedSeason: (seasonId: string) => void
  addPlayer: (name: string, nickname?: string) => Player
  updatePlayer: (playerId: string, patch: Partial<Pick<Player, 'name' | 'nickname' | 'active'>>) => void
  addSeason: (input: Pick<Season, 'name' | 'startDate' | 'endDate'>) => Season
  updateSeason: (seasonId: string, patch: Partial<Pick<Season, 'name' | 'startDate' | 'endDate' | 'status'>>) => void
  setPlayerRole: (seasonId: string, playerId: string, role: PlayerRole, effectiveDate: string) => void
  addSession: (session: Session) => void
  updateSession: (sessionId: string, updater: (session: Session) => Session, undoable?: boolean) => Promise<void>
  undoSession: (sessionId: string) => Promise<boolean>
  finishSession: (session: Session) => void
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  syncNow: () => Promise<void>
  pullCloud: () => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

function dirty(state: AppState): AppState {
  return { ...state, sync: { ...state.sync, pending: true, lastError: null }, updatedAt: Date.now() }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null)
  const [authSession, setAuthSession] = useState<AuthSession | null>(null)
  const [online, setOnline] = useState(navigator.onLine)
  const [syncing, setSyncing] = useState(false)
  const syncTimer = useRef<number | null>(null)

  useEffect(() => {
    loadAppState().then((loaded) => {
      if (loaded.activeSessionId) {
        loaded.sessions = loaded.sessions.map((s) => s.id === loaded.activeSessionId ? recoverSession(s) : s)
      }
      setState(loaded)
    })
    if (cloudConfigured()) getAuthSession().then(setAuthSession).catch(() => undefined)
  }, [])

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  useEffect(() => {
    if (!state) return
    saveAppState(state).catch(console.error)
  }, [state])

  const performSync = useCallback(async (snapshot?: AppState) => {
    const current = snapshot ?? state
    if (!current || !cloudConfigured() || !authSession || !navigator.onLine || syncing) return
    setSyncing(true)
    try {
      await pushAllToCloud(current)
      setState((prev) => prev ? {
        ...prev,
        sync: { ...prev.sync, pending: false, lastError: null, lastSyncAt: Date.now() },
      } : prev)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setState((prev) => prev ? { ...prev, sync: { ...prev.sync, pending: true, lastError: message } } : prev)
    } finally {
      setSyncing(false)
    }
  }, [state, authSession, syncing])

  useEffect(() => {
    if (!state?.sync.pending || !authSession || !online || syncing) return
    if (syncTimer.current) window.clearTimeout(syncTimer.current)
    syncTimer.current = window.setTimeout(() => performSync(state), 1800)
    return () => { if (syncTimer.current) window.clearTimeout(syncTimer.current) }
  }, [state?.updatedAt, state?.sync.pending, authSession, online, syncing, performSync])

  const mutate = useCallback((updater: (current: AppState) => AppState, markDirty = true) => {
    setState((current) => {
      if (!current) return current
      const next = updater(current)
      return markDirty ? dirty(next) : next
    })
  }, [])

  const setSelectedSeason = useCallback((seasonId: string) => {
    mutate((s) => ({ ...s, selectedSeasonId: seasonId }), false)
  }, [mutate])

  const addPlayer = useCallback((name: string, nickname = '') => {
    const now = Date.now()
    const player: Player = { id: crypto.randomUUID(), name: name.trim(), nickname: nickname.trim() || null, active: true, createdAt: now, updatedAt: now }
    mutate((s) => ({ ...s, players: [...s.players, player] }))
    return player
  }, [mutate])

  const updatePlayer = useCallback((playerId: string, patch: Partial<Pick<Player, 'name' | 'nickname' | 'active'>>) => {
    mutate((s) => ({ ...s, players: s.players.map((p) => p.id === playerId ? { ...p, ...patch, updatedAt: Date.now() } : p) }))
  }, [mutate])

  const addSeason = useCallback((input: Pick<Season, 'name' | 'startDate' | 'endDate'>) => {
    const now = Date.now()
    const season: Season = { id: crypto.randomUUID(), ...input, status: 'ACTIVE', createdAt: now, updatedAt: now }
    mutate((s) => ({
      ...s,
      seasons: [...s.seasons.map((old) => old.status === 'ACTIVE' ? { ...old, status: 'CLOSED' as const, updatedAt: now } : old), season],
      selectedSeasonId: season.id,
    }))
    return season
  }, [mutate])

  const updateSeason = useCallback((seasonId: string, patch: Partial<Pick<Season, 'name' | 'startDate' | 'endDate' | 'status'>>) => {
    mutate((s) => ({ ...s, seasons: s.seasons.map((season) => season.id === seasonId ? { ...season, ...patch, updatedAt: Date.now() } : season) }))
  }, [mutate])

  const setPlayerRole = useCallback((seasonId: string, playerId: string, role: PlayerRole, effectiveDate: string) => {
    mutate((s) => ({ ...s, rolePeriods: setRoleFromDate(s.rolePeriods, seasonId, playerId, role, effectiveDate) }))
  }, [mutate])

  const addSession = useCallback((session: Session) => {
    mutate((s) => ({ ...s, sessions: [session, ...s.sessions.filter((x) => x.id !== session.id)], activeSessionId: session.id }))
  }, [mutate])

  const updateSession = useCallback(async (sessionId: string, updater: (session: Session) => Session, undoable = false) => {
    const current = state?.sessions.find((s) => s.id === sessionId)
    if (!current) return
    if (undoable) await saveUndo(structuredClone(current))
    mutate((s) => ({ ...s, sessions: s.sessions.map((session) => session.id === sessionId ? updater(session) : session) }))
  }, [state, mutate])

  const undoSession = useCallback(async (sessionId: string) => {
    const previous = await loadUndo(sessionId)
    if (!previous) return false
    mutate((s) => ({ ...s, sessions: s.sessions.map((x) => x.id === sessionId ? previous : x) }))
    await clearUndo(sessionId)
    return true
  }, [mutate])

  const finishSession = useCallback((session: Session) => {
    mutate((s) => ({ ...s, sessions: s.sessions.map((x) => x.id === session.id ? session : x), activeSessionId: null }))
  }, [mutate])

  const login = useCallback(async (email: string, password: string) => {
    const session = await signIn(email, password)
    setAuthSession(session)
  }, [])

  const logout = useCallback(async () => {
    await signOut()
    setAuthSession(null)
  }, [])

  const syncNow = useCallback(async () => { await performSync() }, [performSync])

  const pullCloud = useCallback(async () => {
    if (!state) return
    setSyncing(true)
    try {
      const next = await pullFromCloud(state)
      await replaceLocalState(next)
      setState(next)
    } finally {
      setSyncing(false)
    }
  }, [state])

  const activeSession = useMemo(() => state?.sessions.find((s) => s.id === state.activeSessionId) ?? null, [state])
  const selectedSeason = useMemo(() => state?.seasons.find((s) => s.id === state.selectedSeasonId) ?? state?.seasons.find((s) => s.status === 'ACTIVE') ?? null, [state])

  if (!state) return <main className="splash">Hleð Mánudagsboltanum…</main>

  return <AppContext.Provider value={{
    state, hydrated: true, online, authSession, cloudReady: cloudConfigured(), syncing,
    activeSession, selectedSeason, setSelectedSeason, addPlayer, updatePlayer, addSeason, updateSeason,
    setPlayerRole, addSession, updateSession, undoSession, finishSession, login, logout, syncNow, pullCloud,
  }}>{children}</AppContext.Provider>
}

export function useApp() {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp must be used inside AppProvider')
  return value
}
