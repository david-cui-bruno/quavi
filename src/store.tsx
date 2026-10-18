import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AvatarSpec } from './brand/Persona'
import { DEFAULT_LISTS, type Story } from './data'
import type { DemoRedemption } from './rewards'
import { onAuthStateChanged, signOut, type User } from 'firebase/auth'
import { auth, api, clearPhotoCache, photoUploader } from './cloud'
import { SyncEngine, type SyncStatus } from './sync-engine.mjs'

export type Screen =
  | 'splash' | 'welcome' | 'login' | 'interests' | 'customize' | 'mood'
  | 'home' | 'openings' | 'writing' | 'details' | 'active' | 'swap' | 'complete' | 'tell'
  | 'friend' | 'explore' | 'route' | 'stop' | 'shelf' | 'profile' | 'lists' | 'read' | 'circle' | 'about' | 'friends'

export type Route = { name: Screen; params?: Record<string, unknown> }

export type Friend = { id: string; name: string }

export type AppState = {
  user: { name: string; avatar: AvatarSpec; interests: string[]; neighborhood: string; authed: boolean; /** 21 or older? decides whether drink spots are suggested */ age21?: boolean; /** who you usually go out with */ who?: 'Solo' | 'With friends' }
  friends: Friend[]
  demoRedemptions: DemoRedemption[]
  mood?: string
  story?: Story
  chapter: number
  shelf: Story[]
  lists: Record<string, string[]>
  library: Record<string, Story>
  game: { xp: number; coins: number; streak: number; badges: string[]; done: Record<string, string[]>; collected: Record<string, number[]>; tripXp: Record<string, number> }
}

const DEFAULT_STATE: AppState = {
  user: {
    name: '',
    avatar: { color: 'Yellow' }, // starts as the plain bird; you add the rest in Make your Quavi
    interests: ['food', 'cozy'],
    neighborhood: 'West Village',
    authed: false,
  },
  friends: [],
  demoRedemptions: [],
  chapter: 0,
  shelf: [],
  lists: Object.fromEntries(DEFAULT_LISTS.map((l) => [l, [] as string[]])),
  library: {},
  game: { xp: 60, coins: 12, streak: 2, badges: ['First detour'], done: {}, collected: {}, tripXp: {} },
}

const KEY = 'quavi.v1'

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) { const p = JSON.parse(raw); return { ...DEFAULT_STATE, ...p, game: { ...DEFAULT_STATE.game, ...(p.game ?? {}) } } }
  } catch {
    /* ignore */
  }
  return DEFAULT_STATE
}

type Ctx = {
  account: User | null
  syncStatus: SyncStatus | 'demo'
  retrySync: () => void
  loadCloud: () => Promise<void>
  importDemo: () => void
  logout: () => Promise<void>
  deleteAccount: (clearDemo: boolean) => Promise<void>
  s: AppState
  update: (fn: (s: AppState) => AppState) => void
  route: Route
  dir: 'fwd' | 'back'
  go: (name: Screen, params?: Record<string, unknown>) => void
  back: () => void
  reset: (name: Screen, params?: Record<string, unknown>) => void
  canBack: boolean
  toast: string | null
  toastOut: boolean
  say: (msg: string) => void
  restart: () => void
}

const StoreCtx = createContext<Ctx>(null as unknown as Ctx)
export const useStore = () => useContext(StoreCtx)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<AppState>(load)
  const stateRef = useRef(s)
  const [account, setAccount] = useState<User | null>(null)
  const [busy, setBusy] = useState(true)
  const [syncStatus, setSyncStatus] = useState<SyncStatus | 'demo'>('demo')
  const engine = useRef<SyncEngine | null>(null)
  const [stack, setStack] = useState<Route[]>([{ name: 'splash' }])
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd')
  const [toast, setToast] = useState<string | null>(null)
  const [toastOut, setToastOut] = useState(false)
  const outTimer = useRef<number | undefined>(undefined)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    let generation = 0
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const ticket = ++generation
      engine.current?.close(); engine.current = null; clearPhotoCache()
      setAccount(user); setBusy(true)
      if (!user) {
        const demo = load(); stateRef.current = demo; setS(demo)
        setSyncStatus('demo'); setBusy(false)
        return
      }
      const next = new SyncEngine({
        uid: user.uid, storage: localStorage,
        initial: { ...structuredClone(DEFAULT_STATE), user: { ...DEFAULT_STATE.user, name: 'Explorer', authed: true } },
        request: (method, body) => api(user, '/state', method, body),
        prepare: photoUploader(user),
        onState: (state) => { if (ticket === generation) { stateRef.current = state; setS(state) } },
        onStatus: (status) => { if (ticket === generation) {
          setSyncStatus(status)
          if (status === 'deleted') { next.close(); localStorage.removeItem(`quavi.account.v1.${user.uid}`); void signOut(auth) }
        } },
      })
      engine.current = next
      void next.open().finally(() => {
        if (ticket !== generation) return
        setBusy(false); setStack([{ name: 'home' }])
      })
    })
    const retry = () => { void engine.current?.flush() }
    window.addEventListener('online', retry)
    const interval = window.setInterval(retry, 30000)
    return () => { generation++; unsubscribe(); engine.current?.close(); window.removeEventListener('online', retry); window.clearInterval(interval) }
  }, [])

  const update = useCallback((fn: (s: AppState) => AppState) => {
    const next = fn(stateRef.current)
    stateRef.current = next; setS(next)
    if (engine.current) engine.current.edit(next)
    else {
      try { localStorage.setItem(KEY, JSON.stringify(next)) }
      catch { setSyncStatus('storage-full') }
    }
  }, [])
  const retrySync = useCallback(() => { void engine.current?.flush() }, [])
  const loadCloud = useCallback(async () => { await engine.current?.useCloud() }, [])
  const importDemo = useCallback(() => {
    const current = engine.current
    if (!current || current.cache.revision !== 0 || current.cache.dirty) throw new Error('Import is only available for an empty account before its first save.')
    update(() => ({ ...load(), user: { ...load().user, authed: true } }))
  }, [update])
  const deleteAccount = useCallback(async (clearDemo: boolean) => {
    const user = auth.currentUser
    if (!user) throw new Error('Sign in again before deleting your account.')
    await api(user, '', 'DELETE', { confirm: 'DELETE' })
    engine.current?.close(); clearPhotoCache()
    localStorage.removeItem(`quavi.account.v1.${user.uid}`)
    if (clearDemo) localStorage.removeItem(KEY)
    await signOut(auth)
    setStack([{ name: 'welcome' }])
  }, [])
  const logout = useCallback(async () => { await signOut(auth); setStack([{ name: 'welcome' }]) }, [])

  const go = useCallback((name: Screen, params?: Record<string, unknown>) => {
    setDir('fwd')
    setStack((st) => [...st, { name, params }])
  }, [])
  const back = useCallback(() => {
    setDir('back')
    setStack((st) => (st.length > 1 ? st.slice(0, -1) : st))
  }, [])
  const reset = useCallback((name: Screen, params?: Record<string, unknown>) => {
    setDir('fwd')
    setStack([{ name, params }])
  }, [])
  const say = useCallback((msg: string) => {
    setToast(msg)
    setToastOut(false)
    window.clearTimeout(timer.current)
    window.clearTimeout(outTimer.current)
    // show it briefly, then fade it out
    outTimer.current = window.setTimeout(() => setToastOut(true), 2200)
    timer.current = window.setTimeout(() => { setToast(null); setToastOut(false) }, 2550)
  }, [])
  const restart = useCallback(() => {
    if (auth.currentUser) return
    localStorage.removeItem(KEY)
    stateRef.current = DEFAULT_STATE
    setS(DEFAULT_STATE)
    setStack([{ name: 'splash' }])
  }, [])

  const value = useMemo<Ctx>(
    () => ({ account, syncStatus, retrySync, loadCloud, importDemo, logout, deleteAccount, s, update, route: stack[stack.length - 1], dir, go, back, reset, canBack: stack.length > 1, toast, toastOut, say, restart }),
    [account, syncStatus, retrySync, loadCloud, importDemo, logout, deleteAccount, s, update, stack, dir, go, back, reset, toast, toastOut, say, restart],
  )
  return <StoreCtx.Provider value={value}>{busy ? <div className="screen col center" role="status" style={{ minHeight: '100dvh', justifyContent: 'center' }}>Opening Quavi…</div> : children}</StoreCtx.Provider>
}
