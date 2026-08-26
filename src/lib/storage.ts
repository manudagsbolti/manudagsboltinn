import type { AppState, Session } from '../domain/types'

const DB_NAME = 'manudagsboltinn'
const DB_VERSION = 2
const STORE = 'app'
const STATE_KEY = 'state-v2'
const UNDO_PREFIX = 'undo:'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function get<T>(key: string): Promise<T | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const request = tx.objectStore(STORE).get(key)
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null)
    request.onerror = () => reject(request.error)
  })
}

async function put<T>(key: string, value: T): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function remove(key: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export function emptyAppState(): AppState {
  const now = Date.now()
  return {
    version: 2,
    players: [],
    seasons: [],
    rolePeriods: [],
    sessions: [],
    activeSessionId: null,
    selectedSeasonId: null,
    sync: {
      pending: false,
      lastSyncAt: null,
      lastError: null,
      deviceId: crypto.randomUUID(),
    },
    updatedAt: now,
  }
}

export async function loadAppState(): Promise<AppState> {
  return (await get<AppState>(STATE_KEY)) ?? emptyAppState()
}

export function saveAppState(state: AppState) {
  return put(STATE_KEY, state)
}

export function saveUndo(session: Session) {
  return put(`${UNDO_PREFIX}${session.id}`, session)
}

export function loadUndo(sessionId: string) {
  return get<Session>(`${UNDO_PREFIX}${sessionId}`)
}

export function clearUndo(sessionId: string) {
  return remove(`${UNDO_PREFIX}${sessionId}`)
}

export async function replaceLocalState(state: AppState) {
  await put(STATE_KEY, state)
}
