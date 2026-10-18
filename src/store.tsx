import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AvatarSpec } from './brand/Persona'
import { DEFAULT_LISTS, type Story } from './data'

export type Screen =
  | 'splash' | 'welcome' | 'login' | 'interests' | 'customize' | 'mood'
  | 'home' | 'openings' | 'writing' | 'details' | 'active' | 'swap' | 'complete' | 'tell'
  | 'friend' | 'explore' | 'route' | 'stop' | 'shelf' | 'profile' | 'lists' | 'read' | 'circle' | 'about' | 'friends'

export type Route = { name: Screen; params?: Record<string, unknown> }

export type Friend = { id: string; name: string }

export type AppState = {
  user: { name: string; avatar: AvatarSpec; interests: string[]; neighborhood: string; authed: boolean; /** 21 or older? decides whether drink spots are suggested */ age21?: boolean; /** who you usually go out with */ who?: 'Solo' | 'With friends' }
  friends: Friend[]
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
  const [stack, setStack] = useState<Route[]>([{ name: 'splash' }])
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd')
  const [toast, setToast] = useState<string | null>(null)
  const [toastOut, setToastOut] = useState(false)
  const outTimer = useRef<number | undefined>(undefined)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s))
    } catch {
      /* ignore */
    }
  }, [s])

  const update = useCallback((fn: (s: AppState) => AppState) => setS((p) => fn(p)), [])
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
    localStorage.removeItem(KEY)
    setS(DEFAULT_STATE)
    setStack([{ name: 'splash' }])
  }, [])

  const value = useMemo<Ctx>(
    () => ({ s, update, route: stack[stack.length - 1], dir, go, back, reset, canBack: stack.length > 1, toast, toastOut, say, restart }),
    [s, update, stack, dir, go, back, reset, toast, toastOut, say, restart],
  )
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}
