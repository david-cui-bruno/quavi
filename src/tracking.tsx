import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { distance, stepToward, type LatLng } from './geo'

export type TrackMode = 'demo' | 'live'
type Perm = 'unknown' | 'granted' | 'denied' | 'unsupported'

type Ctx = {
  pos: LatLng
  accuracy?: number
  mode: TrackMode
  setMode: (m: TrackMode) => void
  perm: Perm
  walking: boolean
  setWalking: (w: boolean) => void
  /** where the demo walker is heading */
  setTarget: (t: LatLng | null) => void
  /** street route the demo walker follows (turn by turn) instead of cutting straight to the target */
  setPath: (p: LatLng[] | null) => void
  teleport: (p: LatLng) => void
  notify: (title: string, body: string) => void
}

/** Where the demo walker starts: a few blocks from the first stop. */
export const START: LatLng = { lat: 40.7329, lng: -74.0031 }

const TrackCtx = createContext<Ctx>(null as unknown as Ctx)
export const useTracking = () => useContext(TrackCtx)

const MODE_KEY = 'quavi.track.mode'

export function TrackingProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<TrackMode>(() => (localStorage.getItem(MODE_KEY) as TrackMode) || 'demo')
  const [pos, setPos] = useState<LatLng>(START)
  const [accuracy, setAccuracy] = useState<number | undefined>()
  const [perm, setPerm] = useState<Perm>(() => ('geolocation' in navigator ? 'unknown' : 'unsupported'))
  const [walking, setWalking] = useState(false)
  const target = useRef<LatLng | null>(null)
  const pathRef = useRef<LatLng[] | null>(null)
  const posRef = useRef(pos)
  posRef.current = pos

  const setMode = useCallback((m: TrackMode) => {
    setModeState(m)
    localStorage.setItem(MODE_KEY, m)
    if (m === 'live') setWalking(false)
  }, [])

  // ---- live GPS (works while the page is open; background tracking needs a native app) ----
  useEffect(() => {
    if (mode !== 'live') return
    if (!('geolocation' in navigator)) { setPerm('unsupported'); return }
    const id = navigator.geolocation.watchPosition(
      (p) => { setPerm('granted'); setPos({ lat: p.coords.latitude, lng: p.coords.longitude }); setAccuracy(p.coords.accuracy) },
      (e) => { if (e.code === e.PERMISSION_DENIED) { setPerm('denied'); setModeState('demo') } },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [mode])

  // ---- demo walker: fast-forwards toward the current target ----
  useEffect(() => {
    if (mode !== 'demo' || !walking) return
    const t = window.setInterval(() => {
      const tg = target.current
      if (!tg) return
      const pth = pathRef.current
      const goal = pth && pth.length ? pth[0] : tg
      // a long way off with no street route means a subway ride in the demo: move much faster
      const far = distance(posRef.current, tg) > 1500
      const next = stepToward(posRef.current, goal, pth && pth.length ? (far ? 45 : 14) : far ? 180 : 14)
      if (pth && pth.length && distance(next, goal) < 1.5) pth.shift()
      setPos(next)
      if (distance(next, tg) < 6) setWalking(false)
    }, 120)
    return () => window.clearInterval(t)
  }, [mode, walking])

  const notify = useCallback((title: string, body: string) => {
    try { navigator.vibrate?.(60) } catch { /* ignore */ }
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification(title, { body })
  }, [])

  const value = useMemo<Ctx>(
    () => ({
      pos, accuracy, mode, setMode, perm, walking, setWalking,
      setTarget: (t) => { target.current = t },
      setPath: (p) => { pathRef.current = p ? [...p] : null },
      teleport: (p) => { setPos(p); setWalking(false) },
      notify,
    }),
    [pos, accuracy, mode, setMode, perm, walking, notify],
  )
  return <TrackCtx.Provider value={value}>{children}</TrackCtx.Provider>
}

export function askNotifications() {
  if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission()
}
