import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { renderToStaticMarkup } from 'react-dom/server'
import { BODY_PLAIN, Persona, type AvatarSpec } from './brand/Persona'
import { distance, type LatLng } from './geo'

/** Map pins are plain silhouettes (like a map pin, not a character): colour says what they are. */
export type PinKind = 'quest' | 'dest' | 'start' | 'current' | 'done' | 'locked'

export type RealPin = {
  id: string
  ll: LatLng
  kind: PinKind
  label?: string
  sub?: string
  selected?: boolean
  /** side-quest pins hide their name until you zoom in, so a busy route stays readable */
  quest?: boolean
  onClick?: () => void
}

export type MapCoin = { id: number; ll: LatLng; got: boolean }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

const SIZE: Record<PinKind, number> = { quest: 22, dest: 30, start: 0, current: 32, done: 26, locked: 22 }

function pinHtml(p: RealPin) {
  if (p.kind === 'start') return `<div class="mpin mpin-start"><span class="dot"></span>${p.label ? `<span class="rlbl">${esc(p.label)}</span>` : ''}</div>`
  const w = Math.round(SIZE[p.kind] * (p.selected ? 1.3 : 1))
  const check = p.kind === 'done' ? '<path d="M50 104 L68 122 L100 84" fill="none" stroke="#F9CB2F" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>' : ''
  const svg = `<svg viewBox="0 24 144 205" width="${w}" height="${Math.round(w * 1.42)}" aria-hidden="true"><path d="${BODY_PLAIN}"/>${check}</svg>`
  const ring = p.kind === 'current' ? '<span class="ring"></span>' : ''
  const label = p.label ? `<span class="rlbl${p.quest && !p.selected ? ' q' : ''}">${esc(p.label)}${p.sub ? ` <em>${esc(p.sub)}</em>` : ''}</span>` : ''
  return `<div class="mpin mpin-${p.kind}${p.selected ? ' sel' : ''}">${ring}${svg}${label}</div>`
}

/**
 * A real OpenStreetMap map: drag, pinch or scroll to zoom. With `you` it works like a navigation map:
 * it follows you as you move, stops following when you drag away, and a locate button brings it back.
 */
export function RealMap({ pins, route, doneRoute, coins, fit, inset = { top: 180, bottom: 340 }, you, youAvatar, follow = false, zoomOnYou = 16, controlsTop = 176 }: {
  pins: RealPin[]
  route?: LatLng[]
  /** the part of the route you've already walked, drawn solid */
  doneRoute?: LatLng[]
  coins?: MapCoin[]
  /** frame these points once (no automatic reframing while you explore) */
  fit?: LatLng[]
  inset?: { top: number; bottom: number }
  you?: LatLng
  youAvatar?: AvatarSpec
  /** start out following `you` */
  follow?: boolean
  zoomOnYou?: number
  /** where the zoom and locate buttons start from the top, so they clear the overlays */
  controlsTop?: number
}) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const youMarker = useRef<L.Marker | null>(null)
  const pinsRef = useRef(pins)
  pinsRef.current = pins
  const following = useRef(follow)
  const [isFollowing, setIsFollowing] = useState(follow)
  const setFollow = (v: boolean) => { following.current = v; setIsFollowing(v) }
  // keep "you" in the open part of the map, clear of the search bar / sheet that cover the edges
  const centerFor = (m: L.Map, ll: LatLng, z: number): L.LatLng => m.unproject(m.project([ll.lat, ll.lng], z).add([0, (inset.bottom - inset.top) / 2]), z)
  const fitKey = (fit ?? []).map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|')

  useEffect(() => {
    if (!el.current) return
    const m = L.map(el.current, { zoomControl: false, attributionControl: false, minZoom: 10, maxZoom: 19, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 90 })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Routes: <a href="https://routing.openstreetmap.de/about.html">FOSSGIS</a> · <a href="https://www.openstreetmap.org/fixthemap">Fix the map</a>'  }).addTo(m)
    L.control.zoom({ position: 'topright' }).addTo(m)
    L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(m)
    m.setView([40.7329, -74.0031], 15)
    const far = () => m.getContainer().classList.toggle('rmap--far', m.getZoom() < 16.25)
    m.on('zoomend', far)
    far()
    // dragging the map yourself ends "follow me"
    m.on('dragstart', () => { if (following.current) setFollow(false) })
    layer.current = L.layerGroup().addTo(m)
    map.current = m
    const ro = new ResizeObserver(() => m.invalidateSize())
    ro.observe(el.current)
    return () => { ro.disconnect(); m.remove(); map.current = null; layer.current = null; youMarker.current = null }
  }, [])

  useEffect(() => {
    const m = map.current
    if (!m || !fit?.length) return
    m.fitBounds(L.latLngBounds(fit.map((p) => [p.lat, p.lng] as [number, number])), { paddingTopLeft: [56, inset.top], paddingBottomRight: [76, inset.bottom], maxZoom: 17, animate: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey])

  // your position: a marker that moves, and the map follows while "follow me" is on
  useEffect(() => {
    const m = map.current
    if (!m || !you) return
    if (!youMarker.current) {
      const svg = renderToStaticMarkup(<Persona spec={youAvatar ?? { color: 'Yellow' }} size={40} />)
      youMarker.current = L.marker([you.lat, you.lng], { icon: L.divIcon({ className: 'rpin-wrap', iconSize: [0, 0], html: `<div class="mpin-you"><span class="pulse"></span>${svg}<span class="rlbl you">You</span></div>` }), interactive: false, keyboard: false, zIndexOffset: 2000 }).addTo(m)
      if (follow) m.setView(centerFor(m, you, zoomOnYou), zoomOnYou, { animate: false })
    } else youMarker.current.setLatLng([you.lat, you.lng])
    if (following.current) m.panTo(centerFor(m, you, m.getZoom()), { animate: true, duration: 0.25, easeLinearity: 1, noMoveStart: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [you?.lat, you?.lng])

  useEffect(() => {
    const g = layer.current
    if (!g) return
    g.clearLayers()
    if (route && route.length > 1) L.polyline(route.map((p) => [p.lat, p.lng] as [number, number]), { color: '#1E1B16', weight: 5, opacity: 0.35, lineCap: 'round', lineJoin: 'round', dashArray: '1 11' }).addTo(g)
    if (doneRoute && doneRoute.length > 1) L.polyline(doneRoute.map((p) => [p.lat, p.lng] as [number, number]), { color: '#EE6A2C', weight: 7, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }).addTo(g)
    for (const c of coins ?? []) {
      if (c.got) continue
      L.marker([c.ll.lat, c.ll.lng], { icon: L.divIcon({ className: 'rpin-wrap', iconSize: [0, 0], html: '<div class="rcoin"></div>' }), interactive: false, keyboard: false, zIndexOffset: -100 }).addTo(g)
    }
    for (const p of pins) {
      const icon = L.divIcon({ className: 'rpin-wrap', iconSize: [0, 0], html: pinHtml(p) })
      const mk = L.marker([p.ll.lat, p.ll.lng], { icon, title: p.label ?? '', keyboard: !!p.onClick, zIndexOffset: p.selected ? 1000 : p.kind === 'dest' || p.kind === 'current' ? 500 : 0 })
      mk.on('click', () => pinsRef.current.find((x) => x.id === p.id)?.onClick?.())
      mk.addTo(g)
    }
  }, [pins, route, doneRoute, coins])

  const recenter = () => {
    const m = map.current
    if (!m || !you) return
    setFollow(true)
    const z = Math.max(m.getZoom(), zoomOnYou)
    m.setView(centerFor(m, you, z), z, { animate: true })
  }

  return (
    <div className="rmap-wrap" style={{ ['--ctl-top' as string]: `${controlsTop}px` }}>
      <div className="rmap" ref={el} />
      {you && (
        <button className={`rmap-locate${isFollowing ? ' on' : ''}`} onClick={recenter} aria-label={isFollowing ? 'Following your location' : 'Center on my location'} aria-pressed={isFollowing}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3.2" fill="currentColor" /><circle cx="12" cy="12" r="7.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
        </button>
      )}
    </div>
  )
}

/** Walking over a coin picks it up (same 26 m reach as the old game map). */
export function useCoinCollect(pos: LatLng, coins: MapCoin[], onCollect: (id: number) => void) {
  useEffect(() => {
    for (const c of coins) if (!c.got && distance(pos, c.ll) < 26) onCollect(c.id)
  }, [pos, coins, onCollect])
}
