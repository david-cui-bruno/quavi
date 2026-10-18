import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { BODY_PLAIN, Logo, MoodLogo, Persona, flock, type AvatarSpec, type Colorway } from './brand/Persona'
import { useStore, type Screen } from './store'

export type Bg = 'paper' | 'yellow' | 'orange' | 'ink' | 'soft' | 'yellow-p' | 'orange-p' | 'ink-p'
export const BG: Record<Bg, string> = {
  paper: 'var(--paper)', yellow: 'var(--yellow)', orange: 'var(--orange)', ink: 'var(--ink)', soft: 'var(--soft)',
  'yellow-p': 'var(--yellow-p)', 'orange-p': 'var(--orange-p)', 'ink-p': 'var(--ink-p)',
}
/** Brand "Pressed" shades — used as surfaces behind characters for contrast. */
export const SURFACE: Record<string, Bg> = { yellow: 'yellow-p', orange: 'orange-p', ink: 'ink-p', soft: 'soft', paper: 'paper' }
export const onDark = (bg: Bg) => bg === 'ink' || bg === 'ink-p'
export const SURFACE_NAMES: Bg[] = ['paper', 'soft', 'yellow', 'orange', 'ink', 'yellow-p', 'orange-p', 'ink-p']

export const Arrow = ({ size = 28, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12h15M13 5l7 7-7 7" />
  </svg>
)
export const Check = ({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.5l4.5 4.5L19 7" />
  </svg>
)

export function Btn({
  kind = 'primary', children, onClick, disabled, inline, sm, style,
}: {
  kind?: 'primary' | 'secondary' | 'accent' | 'soft'
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  inline?: boolean
  sm?: boolean
  style?: CSSProperties
}) {
  return (
    <button className={`btn ${kind}${inline ? ' inline' : ''}${sm ? ' sm' : ''}`} onClick={onClick} disabled={disabled} style={style}>
      {children}
    </button>
  )
}

export const Chip = ({ on, onClick, children }: { on?: boolean; onClick?: () => void; children: ReactNode }) =>
  onClick ? (
    <button className={`chip${on ? ' on' : ''}`} onClick={onClick} aria-pressed={!!on}>{children}</button>
  ) : (
    <span className={`chip${on ? ' on' : ''}`}>{children}</span>
  )

export const Round = ({ kind = 'ink', onClick, label = 'Next', size }: { kind?: 'ink' | 'yellow' | 'soft'; onClick?: () => void; label?: string; size?: number }) => (
  <button className={`round ${kind}`} onClick={onClick} aria-label={label} style={size ? { width: size, height: size } : undefined}><Arrow size={size && size < 64 ? 22 : undefined} /></button>
)

export function BackBtn({ onClick }: { onClick?: () => void }) {
  const { back } = useStore()
  return (
    <button className="back" onClick={onClick ?? back} aria-label="Back">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12H5M11 5l-7 7 7 7" /></svg>
    </button>
  )
}

export const Badge = ({ size = 44 }: { size?: number }) => (
  <div className="badge" style={{ width: size, height: size, borderRadius: size * 0.28 }}>
    <Logo size={size * 0.56} />
  </div>
)

export function Persona$({ name, color = 'Yellow', size = 100, spec, style, className }: {
  name?: string; color?: Colorway; size?: number; spec?: AvatarSpec; style?: CSSProperties; className?: string
}) {
  return (
    <div className={className} style={style}>
      <Persona spec={spec ?? flock(name ?? 'Pip', color)} size={size} title={name} />
    </div>
  )
}

const ICONS: Record<string, ReactNode> = {
  home: <path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" strokeLinejoin="round" />,
  explore: (<><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" fill="currentColor" /></>),
  you: (<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" strokeLinecap="round" /></>),
}

export function TabBar({ active }: { active: 'home' | 'explore' | 'you' }) {
  const { reset } = useStore()
  const tabs: { id: 'home' | 'explore' | 'you'; label: string; to: Screen }[] = [
    { id: 'home', label: 'Home', to: 'home' },
    { id: 'explore', label: 'Explore', to: 'explore' },
    { id: 'you', label: 'You', to: 'profile' },
  ]
  return (
    <nav className="tabbar" aria-label="Main">
      {tabs.map((t) => (
        <button key={t.id} className={`tab${active === t.id ? ' on' : ''}`} aria-current={active === t.id ? 'page' : undefined} onClick={() => active !== t.id && reset(t.to)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">{ICONS[t.id]}</svg>
          {t.label}
        </button>
      ))}
    </nav>
  )
}

export function Sheet({ onClose, children, label }: { onClose: () => void; children: ReactNode; label?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const el = ref.current
    const focusables = () => Array.from(el?.querySelectorAll<HTMLElement>('button, input, textarea, [href], [tabindex]:not([tabindex="-1"])') ?? []).filter((n) => !n.hasAttribute('disabled'))
    ;(focusables()[0] ?? el)?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close.current(); return }
      if (e.key !== 'Tab') return
      const f = focusables()
      if (!f.length) return
      const first = f[0], last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.({ preventScroll: true }) }
  }, [])
  // Rendered on the phone itself, not inside the screen: a screen that scrolls would otherwise carry its sheet up and out of view.
  const host = document.querySelector('.phone') ?? document.body
  return createPortal(
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label ?? 'Details'} ref={ref} tabIndex={-1}>
        <div className="grabber" />
        {children}
      </div>
    </>,
    host,
  )
}

export function Screen$({
  bg = 'paper', children, scroll, flush, tabs, light,
}: { bg?: Bg; children: ReactNode; scroll?: boolean; flush?: boolean; tabs?: 'home' | 'explore' | 'you'; light?: boolean }) {
  const { dir } = useStore()
  return (
    <>
      <main className={`screen${scroll ? ' scroll' : ''}${scroll && bg === 'paper' ? ' masked' : ''}${flush ? ' flush' : ''}${onDark(bg) ? ' dark' : ''}${dir === 'back' ? ' back-nav' : ''}`} style={{ background: BG[bg], paddingBottom: tabs ? 108 : 20 }}>
        {children}
      </main>
      <div aria-hidden="true" className={`statusbar${light || onDark(bg) ? ' light' : ''}`}><span>9:41</span><span>▪▪▪ ▮</span></div>
      {tabs && <TabBar active={tabs} />}
    </>
  )
}

/** A person's own words about a task: their note leads, the task is the small label. */
export function NoteQuote({ task, note, style }: { task: string; note: string; style?: CSSProperties }) {
  return (
    <div style={{ borderLeft: '3px solid var(--yellow)', padding: '2px 0 2px 14px', ...style }}>
      <div className="it" style={{ fontSize: 17, lineHeight: 1.35 }}>“{note}”</div>
      <div className="small muted" style={{ marginTop: 4 }}>{task}</div>
    </div>
  )
}

/** Plain facts (not buttons): a bold value over a small caps label, split by thin lines. */
export function StatRow({ stats, size = 20, style }: { stats: readonly (readonly [ReactNode, string])[]; size?: number; style?: CSSProperties }) {
  return (
    <div style={{ display: 'flex', padding: '12px 0', borderTop: '1px solid rgba(30,27,22,.14)', borderBottom: '1px solid rgba(30,27,22,.14)', ...style }}>
      {stats.map(([value, label], k) => (
        <div key={label} style={{ flex: 1, minWidth: 0, paddingLeft: k ? 16 : 0, borderLeft: k ? '1px solid rgba(30,27,22,.14)' : 'none' }}>
          <div style={{ fontWeight: 700, fontSize: size, letterSpacing: '-.01em', lineHeight: 1.1 }}>{value}</div>
          <div className="kicker" style={{ marginTop: 4 }}>{label}</div>
        </div>
      ))}
    </div>
  )
}

export const RATING_LABELS = ['', 'Not for me', 'Not quite', 'It was fine', 'Liked it', 'Loved it'] as const

/** The five-duck rating, showing which one you picked. */
export function RatingDucks({ rating, size = 20, compact }: { rating: 1 | 2 | 3 | 4 | 5; size?: number; compact?: boolean }) {
  return (
    <div role="img" aria-label={`You rated this: ${RATING_LABELS[rating]}`} style={{ display: 'flex', alignSelf: 'flex-start', gap: compact ? 2 : 6, alignItems: 'center', padding: compact ? '4px 8px' : '6px 12px', borderRadius: 18, background: 'var(--paper)' }}>
      {([1, 2, 3, 4, 5] as const).map((lv) => (
        <span key={lv} style={{ display: 'grid', placeItems: 'center', width: size + 6, height: size + 10, borderRadius: 10, background: rating === lv ? 'var(--yellow-p)' : 'transparent', opacity: rating === lv ? 1 : 0.4, transform: rating === lv ? 'scale(1.2)' : 'none' }}>
          <MoodLogo level={lv} size={size} />
        </span>
      ))}
    </div>
  )
}

/** The side-quest map pin as an icon: just the silhouette. */
export function PinIcon({ size = 28, color = '#EE6A2C', style }: { size?: number; color?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 24 144 205" width={size} height={Math.round(size * 1.42)} aria-hidden="true" style={{ display: 'block', ...style }}><path d={BODY_PLAIN} fill={color} /></svg>
  )
}
