import {OutingSync,outingStorage,profileOnly,type OutingStatus} from './outing-sync.mjs'
import {runtime} from './runtime'
import {scrubGoogleContent} from './google-retention.mjs'
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
  user: { onboarding?: 'about' | 'interests' | 'customize' | 'complete'; name: string; avatar: AvatarSpec; interests: string[]; neighborhood: string; authed: boolean; /** 21 or older? decides whether drink spots are suggested */ age21?: boolean; /** who you usually go out with */ who?: 'Solo' | 'With friends' }
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

const hasActivity = (state: AppState) => !!state.story || state.shelf.length > 0 || Object.keys(state.library).length > 0 || state.friends.length > 0 || state.demoRedemptions.length > 0 || Object.values(state.lists).some(ids=>ids.length>0) || [state.game.done,state.game.collected,state.game.tripXp].some(entries=>Object.keys(entries).length>0)

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
  rewards: {confirmedXp:number;legacyXp:number;balance:number;dailyRemaining?:number;dailyLimit?:number}|null
  pendingRewards: string[]
  rewardError: string
  redeemReward: (offerId:string)=>void
  outingStatus: OutingStatus | 'demo'
  resolveOuting: (choice: 'cloud' | 'local') => Promise<void>
  syncStatus: SyncStatus | 'demo'
  retrySync: () => void
  loadCloud: () => Promise<void>
  canImportDemo: boolean
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
  const outings = useRef<OutingSync | null>(null)
  const disk = useMemo(()=>outingStorage(),[])
  const [outingStatus,setOutingStatus] = useState<OutingStatus | 'demo'>('demo')
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
      engine.current?.close(); engine.current = null; outings.current?.close(); outings.current=null; clearPhotoCache()
      setAccount(user); setBusy(true)
      if (!user) {
        const demo = load(); stateRef.current = demo; setS(demo)
        setSyncStatus('demo'); setOutingStatus('demo'); setBusy(false)
        return
      }
      let routed = false, outingsReady = false, accountReadable = false
      const enterAccount = (state: AppState) => {
        if (routed || !outingsReady || ticket !== generation) return
        routed = true; setBusy(false)
        const step = state.user.onboarding
        const legacyComplete = state.user.name.trim() && typeof state.user.age21 === 'boolean'
        setStack([{name: step && step !== 'complete' ? step : step === 'complete' || legacyComplete ? 'home' : 'about'}])
      }
      const initial: AppState = { ...structuredClone(DEFAULT_STATE), game: { ...structuredClone(DEFAULT_STATE.game), xp: 0, coins: 0, streak: 0, badges: [] }, user: { ...DEFAULT_STATE.user, name: '', onboarding: 'about', authed: true } }
      const next = new SyncEngine({
        uid: user.uid, storage: localStorage,
        initial,
        request: (method, body) => api(user, '/state', method, body ? scrubGoogleContent({...body as {state:AppState;revision:number},state:profileOnly((body as {state:AppState}).state)}) : undefined),
        sanitize: scrubGoogleContent,
        available:()=>runtime.get().active&&runtime.get().online,
        prepare: async state=>profileOnly(state),
        writable:()=>outingsReady,
        onState: (state) => { if (ticket === generation) { const view=outingsReady ? outings.current!.project(state) : state; stateRef.current = view; setS(view) } },
        onStatus: (status) => { if (ticket === generation) {
          setSyncStatus(status)
          if(['empty','saved','pending','conflict'].includes(status))accountReadable=true
          if (['empty','saved','pending','conflict'].includes(status) || (knownCache && ['offline','storage-full'].includes(status))) enterAccount(next.cache.state)
          if (status === 'deleted') { next.close(); outing.close();void disk.remove(user.uid); localStorage.removeItem(`quavi.account.v1.${user.uid}`); setStack([{name:'welcome'}]); void signOut(auth) }
        } },
      })
      const knownCache = next.cache.state !== initial
      engine.current = next
      stateRef.current=next.cache.state;setS(next.cache.state)
      // A known account cache can open offline; unknown accounts wait for their own remote state.
      if (!runtime.get().online && knownCache) enterAccount(next.cache.state)
      const outing = new OutingSync({uid:user.uid,storage:disk,
        request:(method,body)=>api(user,method==='GET'?'/outings':method==='REDEEM'?'/rewards/redemptions':'/outings/operations',method==='REDEEM'?'POST':method,body),
        prepare:photoUploader(user),available:()=>runtime.get().active&&runtime.get().online,
        onChange:()=>{if(ticket===generation&&outingsReady){const view=outing.project(next.cache.state);stateRef.current=view;setS(view)}},
        onStatus:status=>{if(ticket===generation){setOutingStatus(status);if(status==='deleted'){void disk.remove(user.uid);void signOut(auth)}}},
      });outings.current=outing;setOutingStatus('pending')
      void (async()=>{
        await next.open();if(ticket!==generation)return
        await outing.open(next.cache.state,next.cache.dirty);if(ticket!==generation)return
        outingsReady=true;const view=outing.project(next.cache.state);stateRef.current=view;setS(view)
        if(knownCache || accountReadable)enterAccount(view)
        void next.flush()
      })()
    })
    const retry = () => { void engine.current?.flush();void outings.current?.flush() }
    const stopRuntime=runtime.subscribe(()=>{if(runtime.get().active&&runtime.get().online){void engine.current?.resume();void outings.current?.flush()}})
    const interval = window.setInterval(retry, 30000)
    return () => { generation++; unsubscribe(); engine.current?.close(); outings.current?.close(); stopRuntime(); window.clearInterval(interval) }
  }, [disk])

  const update = useCallback((fn: (s: AppState) => AppState) => {
    const before=stateRef.current
    const next = fn(before)
    if(next===before)return
    if(outings.current?.loaded)outings.current.edit(before,next)
    stateRef.current = next; setS(next)
    if (engine.current) { if(JSON.stringify(profileOnly(before))!==JSON.stringify(profileOnly(next)))engine.current.edit(profileOnly(next)) }
    else {
      try { localStorage.setItem(KEY, JSON.stringify(scrubGoogleContent(next))) }
      catch { setSyncStatus('storage-full') }
    }
  }, [])
  const retrySync = useCallback(() => { void engine.current?.flush();void outings.current?.flush() }, [])
  const resolveOuting = useCallback(async(choice:'cloud'|'local')=>{await outings.current?.resolve(choice)},[])
  const loadCloud = useCallback(async () => { await engine.current?.useCloud() }, [])
  const canImportDemo = !!account && ['saved','empty'].includes(syncStatus) && !hasActivity(s)
  const importDemo = useCallback(() => {
    const current = engine.current
    if (!current || current.cache.dirty || hasActivity(current.cache.state)) throw new Error('Import is only available before this account has saved detour activity.')
    update(() => ({ ...load(), user: { ...load().user, authed: true, onboarding: 'complete' } }))
  }, [update])
  const deleteAccount = useCallback(async (clearDemo: boolean) => {
    const user = auth.currentUser
    if (!user) throw new Error('Sign in again before deleting your account.')
    await api(user, '', 'DELETE', { confirm: 'DELETE' })
    engine.current?.close(); outings.current?.close();await disk.remove(user.uid); clearPhotoCache()
    localStorage.removeItem(`quavi.account.v1.${user.uid}`)
    if (clearDemo) localStorage.removeItem(KEY)
    await signOut(auth)
    setStack([{ name: 'welcome' }])
  }, [disk])
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
    () => ({ account, rewards:outings.current?.cache.rewards??null,pendingRewards:(outings.current?.cache.pendingRewards??[]).map((x:{offerId:string})=>x.offerId),rewardError:outings.current?.cache.rewardError??'',redeemReward:(offerId:string)=>outings.current?.redeem(offerId),syncStatus, outingStatus, resolveOuting, retrySync, loadCloud, canImportDemo, importDemo, logout, deleteAccount, s, update, route: stack[stack.length - 1], dir, go, back, reset, canBack: stack.length > 1, toast, toastOut, say, restart }),
    [account,syncStatus,outingStatus,resolveOuting,retrySync,loadCloud,canImportDemo,importDemo,logout,deleteAccount,s,update,stack,dir,go,back,reset,toast,toastOut,say,restart],
  )
  const loadFailed = ['offline','sign-in-required','save-error','storage-full'].includes(syncStatus)
  const loadMessage = syncStatus === 'storage-full' ? 'Free up device storage, then try loading your account again.' : syncStatus === 'sign-in-required' ? 'Sign in again to load your account.' : 'Connect to load your account before continuing.'
  return <StoreCtx.Provider value={value}>{busy ? <div className="screen col center" role="status" style={{ minHeight: '100dvh', justifyContent: 'center', gap: 16 }}><p>{loadFailed ? loadMessage : 'Opening Quavi…'}</p>{loadFailed && <><button className="btn" onClick={() => void engine.current?.open()}>Try again</button><button className="small" style={{minHeight:44}} onClick={() => void logout()}>Log out</button></>}</div> : children}</StoreCtx.Provider>
}
