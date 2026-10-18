import { useCallback, useEffect, useRef, useState } from 'react'
import type { LatLng } from './geo'

/** One instruction on a walking route, e.g. "Turn left onto Bleecker St". */
export type Maneuver = { type: string; modifier?: string; bearingAfter?: number }
export type NavStep = { maneuver: Maneuver; name: string; distance: number; duration: number; /** index into the route line where this step begins */ start: number }
export type WalkRoute = { geometry: LatLng[]; steps: NavStep[]; distance: number; duration: number }

// Free walking-route service built on OpenStreetMap (no key). A real launch should use a paid directions API.
const BASE = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot/'

const COMPASS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']
export const compass = (bearing = 0) => COMPASS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8]

export const bearingTo = (a: LatLng, b: LatLng) => {
  const k = Math.cos((a.lat * Math.PI) / 180)
  return ((Math.atan2((b.lng - a.lng) * k, b.lat - a.lat) * 180) / Math.PI + 360) % 360
}

const TURN: Record<string, string> = {
  left: 'Turn left', right: 'Turn right', 'slight left': 'Bear left', 'slight right': 'Bear right',
  'sharp left': 'Make a sharp left', 'sharp right': 'Make a sharp right', straight: 'Continue straight', uturn: 'Make a U-turn',
}

/** Plain-language instruction for one maneuver. */
export function stepText(m: Maneuver, name: string, dest?: string): string {
  const onto = name ? ` onto ${name}` : ''
  const turn = TURN[m.modifier ?? 'straight'] ?? 'Continue'
  switch (m.type) {
    case 'depart': return `Head ${compass(m.bearingAfter)}${name ? ` on ${name}` : ''}`
    case 'arrive': return dest ? `You’ve arrived at ${dest}` : 'You’ve arrived'
    case 'end of road': return `${turn} at the end of the road`
    case 'fork': return `Keep ${m.modifier?.includes('left') ? 'left' : 'right'} at the fork`
    case 'roundabout': case 'rotary': return 'Take the roundabout'
    case 'new name': case 'continue': return name ? `Continue on ${name}` : 'Continue straight'
    case 'turn': return `${turn}${onto}`
    default: return `${turn}${onto}`
  }
}

export async function fetchWalkingRoute(points: LatLng[], signal?: AbortSignal): Promise<WalkRoute> {
  const coords = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';')
  const res = await fetch(`${BASE}${coords}?steps=true&geometries=geojson&overview=full`, { signal })
  if (!res.ok) throw new Error(`Directions failed (${res.status})`)
  const data = await res.json()
  if (data.code !== 'Ok' || !data.routes?.[0]) throw new Error('No walking route found')
  const r = data.routes[0]
  const geometry: LatLng[] = []
  const steps: NavStep[] = []
  for (const leg of r.legs) {
    for (const st of leg.steps) {
      const start = geometry.length ? geometry.length - 1 : 0
      ;(st.geometry.coordinates as [number, number][]).forEach((c, k) => { if (k === 0 && geometry.length) return; geometry.push({ lat: c[1], lng: c[0] }) })
      const maneuver: Maneuver = { type: st.maneuver.type, modifier: st.maneuver.modifier, bearingAfter: st.maneuver.bearing_after }
      steps.push({ maneuver, name: st.name ?? '', distance: st.distance, duration: st.duration, start })
    }
  }
  return { geometry, steps, distance: r.distance, duration: r.duration }
}

const keyOf = (pts: LatLng[]) => pts.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|')

/** Fetches a walking route through the given points. Pass null to turn it off. */
export function useWalkingRoute(points: LatLng[] | null) {
  const [route, setRoute] = useState<WalkRoute | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const abort = useRef<AbortController | null>(null)
  const last = useRef(0)
  const pointsRef = useRef(points)
  pointsRef.current = points
  const key = points ? keyOf(points) : ''

  const load = useCallback((pts: LatLng[]) => {
    abort.current?.abort()
    const ac = new AbortController()
    abort.current = ac
    last.current = Date.now()
    setStatus('loading')
    fetchWalkingRoute(pts, ac.signal).then((r) => { if (!ac.signal.aborted) { setRoute(r); setStatus('ready') } }).catch((e) => { if ((e as Error).name !== 'AbortError') setStatus('error') })
  }, [])

  useEffect(() => {
    if (!points) { setRoute(null); setStatus('idle'); return }
    load(points)
    return () => abort.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, load])

  /** Ask for a fresh route from a new starting point (e.g. after leaving the route). Limited to once every 8 s. */
  const reroute = useCallback((from: LatLng) => {
    const pts = pointsRef.current
    if (!pts || Date.now() - last.current < 8000) return false
    load([from, ...pts.slice(1)])
    return true
  }, [load])

  return { route, status, reroute }
}

/** Meters from point to the route line, how far along the route they are, and which step they're on. */
export function locateOnRoute(pos: LatLng, route: WalkRoute) {
  const g = route.geometry
  let bestD = Infinity, bestI = 0, bestT = 0
  const kx = Math.cos((pos.lat * Math.PI) / 180) * 111320
  const ky = 110540
  const cum: number[] = [0]
  for (let i = 0; i < g.length - 1; i++) {
    const ax = (g[i].lng - pos.lng) * kx, ay = (g[i].lat - pos.lat) * ky
    const bx = (g[i + 1].lng - pos.lng) * kx, by = (g[i + 1].lat - pos.lat) * ky
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0
    const d = Math.hypot(ax + dx * t, ay + dy * t)
    if (d < bestD) { bestD = d; bestI = i; bestT = t }
    cum.push(cum[i] + Math.sqrt(len2))
  }
  const along = cum[bestI] + bestT * (cum[bestI + 1] - cum[bestI])
  const stepAt = route.steps.map((s) => cum[Math.min(s.start, cum.length - 1)])
  let idx = 0
  for (let i = 0; i < stepAt.length; i++) if (stepAt[i] <= along + 1) idx = i
  const total = cum[cum.length - 1]
  const up = route.steps[idx + 1]
  return {
    off: bestD,
    along,
    total,
    stepIndex: idx,
    /** the next thing you must do, and how far away it is */
    upcoming: up ?? route.steps[idx],
    upcomingIndex: up ? idx + 1 : idx,
    toUpcoming: up ? Math.max(0, stepAt[idx + 1] - along) : Math.max(0, total - along),
    remaining: Math.max(0, total - along),
    secondsLeft: route.duration * (total ? Math.max(0, total - along) / total : 0),
  }
}

export const fmtMeters = (m: number) => (m < 950 ? `${Math.max(5, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1)} km`)
