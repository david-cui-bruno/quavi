import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Persona, flock, safeSurface, type AvatarSpec } from './brand/Persona'
import { distance, makeProjector, type LatLng } from './geo'
import { levelName, levelOf, levelProgress } from './data'
import { useStore } from './store'

export type MapPin = {
  id: string
  name: string
  ll: LatLng
  persona: string
  color: 'Yellow' | 'Ink' | 'Orange'
  state: 'done' | 'current' | 'locked' | 'quest'
  xp?: number
  onClick?: () => void
}

export type Coin = { id: number; ll: LatLng; got: boolean }

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ w: 390, h: 760 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth || 390, h: el.clientHeight || 760 }))
    ro.observe(el)
    setSize({ w: el.clientWidth || 390, h: el.clientHeight || 760 })
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}

/** Coins sit halfway along each leg of the route; collect by walking past them. */
export function coinsFor(route: LatLng[], got: number[]): Coin[] {
  const out: Coin[] = []
  for (let i = 0; i < route.length - 1; i++) {
    for (const t of [0.35, 0.7]) {
      const id = i * 10 + Math.round(t * 10)
      out.push({ id, ll: { lat: route[i].lat + (route[i + 1].lat - route[i].lat) * t, lng: route[i].lng + (route[i + 1].lng - route[i].lng) * t }, got: got.includes(id) })
    }
  }
  return out
}

export function GameHUD({ compact }: { compact?: boolean }) {
  const { s } = useStore()
  const { xp, coins, streak } = s.game
  return (
    <div className="hud">
      <div className="hud-av" style={{ background: `var(--${safeSurface(s.user.avatar, 'orange-p')})` }}><Persona spec={s.user.avatar} size={30} /></div>
      <div className="hud-lv">
        <div className="hud-top"><b>Lv {levelOf(xp)}</b>{!compact && <span>{levelName(xp)}</span>}</div>
        <div className="hud-bar"><i style={{ width: `${Math.max(6, levelProgress(xp) * 100)}%` }} /></div>
      </div>
      <span className="hud-chip coin"><i /> {coins}</span>
      <span className="hud-chip flame">🔥 {streak}</span>
    </div>
  )
}

export function GameMap({
  pins, route, doneUpTo = -1, you, avatar, coins = [], onCollect, children, followYou, pad = 80, inset,
}: {
  pins: MapPin[]
  route: LatLng[]
  doneUpTo?: number
  you?: LatLng
  avatar?: AvatarSpec
  coins?: Coin[]
  onCollect?: (id: number) => void
  children?: ReactNode
  followYou?: boolean
  pad?: number
  /** keep pins out of overlays (HUD on top, sheet below) */
  inset?: { top: number; bottom: number }
}) {
  const [ref, { w, h }] = useSize<HTMLDivElement>()
  const pts = useMemo(() => [...route, ...pins.map((p) => p.ll), ...(you ? [you] : [])], [route, pins, you])
  const proj = useMemo(() => {
    const top = inset?.top ?? 0, bottom = inset?.bottom ?? 0
    const base = makeProjector(followYou && you ? [you, ...pins.map((p) => p.ll)] : pts, w, h - top - bottom, pad)
    return (p: LatLng) => { const q = base(p); return { x: q.x, y: q.y + top } }
  }, [pts, w, h, pad, followYou, you, pins, inset?.top, inset?.bottom])

  // collect coins when walking over them
  useEffect(() => {
    if (!you || !onCollect) return
    for (const c of coins) if (!c.got && distance(you, c.ll) < 26) onCollect(c.id)
  }, [you, coins, onCollect])

  const P = route.map(proj)
  const path = (a: number, b: number) => P.slice(a, b + 1).map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const doneEnd = Math.min(doneUpTo, P.length - 1)
  const me = you ? proj(you) : null

  return (
    <div className="map gmap" ref={ref} style={{ background: "#F7F4EC" }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <defs>
          <pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.4" fill="#1E1B16" opacity=".07" /></pattern>
          <filter id="glow"><feGaussianBlur stdDeviation="5" /></filter>
        </defs>
        <rect width={w} height={h} fill="#F7F4EC" />
        <rect width={w} height={h} fill="url(#dots)" />
        {/* decorative city grid, rotated like Manhattan */}
        <g transform={`rotate(-29 ${w / 2} ${h / 2})`}>
          {Array.from({ length: 9 }).map((_, i) => <rect key={'h' + i} x={-w} y={h * 0.12 * i - 30} width={w * 3} height={13} fill="#E8E1CC" />)}
          {Array.from({ length: 14 }).map((_, i) => <rect key={'v' + i} x={w * 0.14 * i - w * 0.2} y={-h} width={9} height={h * 3} fill="#E8E1CC" />)}
          <rect x={w * 0.15} y={h * 0.22} width={w * 0.34} height={h * 0.11} rx="26" fill="#F6DF8E" />
          <rect x={w * 0.6} y={h * 0.5} width={w * 0.3} height={h * 0.12} rx="26" fill="#F6DF8E" />
        </g>
        {/* trail: dotted ahead, solid + glow behind */}
        {P.length > 1 && <path d={path(0, P.length - 1)} stroke="#1E1B16" strokeOpacity=".35" strokeWidth="5" strokeDasharray="1 11" strokeLinecap="round" fill="none" />}
        {doneEnd >= 1 && (
          <>
            <path d={path(0, doneEnd)} stroke="#F9CB2F" strokeWidth="16" fill="none" strokeLinecap="round" strokeLinejoin="round" filter="url(#glow)" opacity=".9" />
            <path d={path(0, doneEnd)} stroke="#EE6A2C" strokeWidth="8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
        {coins.map((c) => {
          const p = proj(c.ll)
          return c.got ? null : (
            <g key={c.id} transform={`translate(${p.x} ${p.y})`}>
              <g className="coin-g"><circle r="11" fill="#F9CB2F" /><circle r="7" fill="none" stroke="#1E1B16" strokeWidth="2" opacity=".8" /><rect x="-1.4" y="-4" width="2.8" height="8" rx="1.4" fill="#1E1B16" /></g>
            </g>
          )
        })}
        {me && <circle cx={me.x} cy={me.y} r={ARR} fill="#F9CB2F" opacity=".22" className="radar" />}
      </svg>

      {pins.map((p, pi) => {
        const q = proj(p.ll)
        return (
          <button key={p.id} className={`pin gpin ${p.state}`} style={{ left: q.x, top: q.y, ['--d' as string]: `${Math.min(pi, 7) * 40}ms` }} onClick={p.onClick} aria-label={p.name}>
            {p.state === 'current' && <span className="ring" />}
            {p.state === 'quest' && <span className="ring soft" />}
            <div className="pcs-wrap" style={{ opacity: p.state === 'locked' ? 0.55 : 1, filter: p.state === 'locked' ? 'grayscale(.5)' : undefined }}>
              <Persona spec={flock(p.persona, p.color)} size={p.state === 'current' ? 60 : p.state === 'quest' ? 40 : 50} />
            </div>
            {p.state === 'done' && <span className="stamp">✓</span>}
            {p.state === 'quest' || p.state === 'locked' ? null : <span className="lbl">{p.name}{p.xp ? <em>+{p.xp} XP</em> : null}</span>}
          </button>
        )
      })}

      {me && avatar && (
        <div className="you" style={{ left: me.x, top: me.y }}>
          <div className="you-shadow" />
          <div className="bounce"><Persona spec={avatar} size={54} /></div>
          <span className="you-tag">You</span>
        </div>
      )}
      {children}
    </div>
  )
}

const ARR = 40
