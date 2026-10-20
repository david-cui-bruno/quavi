import type { CSSProperties } from 'react'
import { COLOR, PARTS, SLOT_OPTIONS, type ColorKey, type Shape } from './partsData'

export type Colorway = 'Yellow' | 'Ink' | 'Orange'

export type AvatarSpec = {
  color: Colorway
  hair?: string
  headwear?: string
  eyewear?: string
  face?: string[]
  neckwear?: string
}

// ---------- logo (exact vector data from the brand file) ----------
export const BODY =
  'M 72 227.8125 C 49.5 201.9375 0 151.3125 0 97.3125 C -0.0005612780126194039 83.39242851734161 4.034019291400909 69.77064228057861 11.615312576293945 58.09620952606201 C 19.19660586118698 46.42177677154541 29.999521851539612 37.195302844047546 42.716251373291016 31.533748626708984 C 45.50625139474869 25.31249839067459 48.9375 20.8125 48.9375 15.1875 C 48.9375 8.4375 39.375 7.200000107288361 32.625 9.5625 C 36 5.0625 42.75 0 49.5 0 C 55.125 0 61.3125 3.599999785423279 64.125 8.4375 C 67.5 14.287499785423279 68.8500035405159 25.20000102929771 74.5087537765503 25.35750102996826 C 93.1584062576294 26.00771965831518 110.82713091373444 33.87335801124573 123.7906322479248 47.29646873474121 C 136.75413358211517 60.719579458236694 143.9996683535319 78.65151786804199 144 97.3125 C 144 151.3125 94.5 201.9375 72 227.8125 Z'
/** Body outline without the feather curl on top: a plain silhouette for shapes and buttons. */
export const BODY_PLAIN = BODY.replace(/42\.716251373291016 31\.533748626708984 .*? 74\.5087537765503 25\.35750102996826 /, '42.716251373291016 31.533748626708984 C 53 28.5 64 25.2 74.5087537765503 25.35750102996826 ')
const BEAK =
  'M 10.125 0 L 41.625 0 C 47.216883301734924 0 51.75 4.533116698265076 51.75 10.125 C 51.75 15.716883301734924 47.216883301734924 20.25 41.625 20.25 L 10.125 20.25 C 4.533116698265076 20.25 0 15.716883301734924 0 10.125 C 0 4.533116698265076 4.533116698265076 0 10.125 0 Z'

function LogoShapes({ body, beak }: { body: string; beak: string }) {
  return (
    <g>
      <path d={BODY} transform="translate(4.5 5.0625)" fill={body} />
      <circle cx={48.375 + 28.125} cy={65.25 + 28.125} r={28.125} fill={COLOR.P} />
      <circle cx={66.375 + 19.125} cy={74.25 + 19.125} r={19.125} fill={COLOR.K} />
      <circle cx={87.75 + 4.5} cy={82.125 + 4.5} r={4.5} fill={COLOR.P} />
      <path d={BEAK} transform="translate(123.2556 103.7431) rotate(3)" fill={beak} />
    </g>
  )
}

export function Logo({ size = 120, style }: { size?: number; style?: CSSProperties }) {
  return (
    <svg
      width={size}
      height={(size * 236.25) / 180}
      viewBox="0 0 180 236.25"
      style={style}
      role="img"
      aria-label="Quavi"
    >
      <LogoShapes body={COLOR.Y} beak={COLOR.O} />
    </svg>
  )
}

// ---------- colorway recolor so accessories never match the body ----------
function mapColor(c: ColorKey | undefined, way: Colorway, part?: string): string | undefined {
  if (!c) return undefined
  if (way === 'Ink' && c === 'K') return COLOR.P
  if (way === 'Orange') {
    if (c === 'O') return COLOR.K
    if (c === 'Q') return part === 'Face/Blush' ? COLOR.Y : COLOR.K
  }
  return COLOR[c]
}

function renderShape(s: Shape, i: number, way: Colorway, part?: string) {
  const fill = mapColor(s.fill, way, part) ?? 'none'
  const stroke = mapColor(s.stroke, way, part)
  const common = {
    fill,
    fillOpacity: s.a ?? 1,
    stroke,
    strokeWidth: s.sw,
    strokeLinejoin: 'round' as const,
    strokeLinecap: (s.t === 'v' && s.round ? 'round' : 'butt') as 'round' | 'butt',
  }
  if (s.t === 'o')
    return <circle key={i} cx={s.x + s.r} cy={s.y + s.r} r={s.r} {...common} />
  return <path key={i} d={s.d} transform={`translate(${s.x} ${s.y})`} {...common} />
}

function Part({ id, way }: { id?: string; way: Colorway }) {
  if (!id || !PARTS[id]) return null
  return <g>{PARTS[id].map((s, i) => renderShape(s, i, way, id))}</g>
}

function backOf(hair?: string) {
  return SLOT_OPTIONS.hair.find((h) => h.id === hair)?.back
}

export function Persona({
  spec,
  size = 120,
  style,
  title,
}: {
  spec: AvatarSpec
  size?: number
  style?: CSSProperties
  title?: string
}) {
  const way = spec.color
  const body = way === 'Ink' ? COLOR.K : way === 'Orange' ? COLOR.O : COLOR.Y
  const beak = way === 'Orange' ? COLOR.Y : COLOR.O
  return (
    <svg
      width={size}
      height={size * 1.25}
      viewBox="0 0 240 300"
      style={{ display: 'block', overflow: 'visible', ...style }}
      role="img"
      aria-label={title ?? 'Quavi character'}
      data-color={way}
      data-colors={usedColors(spec).join(',')}
    >
      <Part id={backOf(spec.hair)} way={way} />
      <g transform="translate(30 50)">
        <LogoShapes body={body} beak={beak} />
      </g>
      <Part id={spec.neckwear} way={way} />
      {(spec.face ?? []).map((f) => (
        <Part key={f} id={f} way={way} />
      ))}
      <Part id={spec.eyewear} way={way} />
      <Part id={spec.hair} way={way} />
      <Part id={spec.headwear} way={way} />
    </svg>
  )
}

// ---------- the Flock (named personas from the kit) ----------
export const FLOCK: Record<string, AvatarSpec> = {
  Pip: { color: 'Yellow', headwear: 'Headwear/Bucket Hat', neckwear: 'Neckwear/Backpack', face: ['Face/Freckles'] },
  'Prof. Quill': { color: 'Yellow', hair: 'Hair/Swoop', eyewear: 'Eyewear/Round', face: ['Face/Handlebar'], neckwear: 'Neckwear/Bowtie' },
  Juno: { color: 'Yellow', headwear: 'Headwear/Beret', eyewear: 'Eyewear/Cat-eye', face: ['Face/Lashes'], neckwear: 'Neckwear/Camera' },
  Biscuit: { color: 'Yellow', headwear: 'Headwear/Chef Hat', face: ['Face/Blush'], neckwear: 'Neckwear/Bandana' },
  Maple: { color: 'Yellow', headwear: 'Headwear/Beanie', face: ['Face/Freckles'], neckwear: 'Neckwear/Scarf' },
  Dax: { color: 'Yellow', hair: 'Hair/Mohawk', eyewear: 'Eyewear/Square', neckwear: 'Neckwear/Necktie' },
  Coco: { color: 'Yellow', hair: 'Hair/Afro Puff', eyewear: 'Eyewear/Heart Shades', face: ['Face/Blush'] },
  Rex: { color: 'Yellow', headwear: 'Headwear/Cowboy Hat', face: ['Face/Handlebar'], neckwear: 'Neckwear/Bandana' },
  Luna: { color: 'Yellow', hair: 'Hair/Long Waves', face: ['Face/Sleepy', 'Face/Lashes'] },
  'Sir Waddles': { color: 'Yellow', headwear: 'Headwear/Top Hat', eyewear: 'Eyewear/Monocle', face: ['Face/Handlebar'], neckwear: 'Neckwear/Necktie' },
  Zed: { color: 'Yellow', headwear: 'Headwear/Cap', eyewear: 'Eyewear/Shades', neckwear: 'Neckwear/Backpack' },
  'Nana Bea': { color: 'Yellow', hair: 'Hair/Top Bun', eyewear: 'Eyewear/Half-moon', face: ['Face/Blush'] },
  Poppy: { color: 'Yellow', hair: 'Hair/Ponytail', face: ['Face/Blush'] },
  Curly: { color: 'Yellow', hair: 'Hair/Curly Top', face: ['Face/Wink'], neckwear: 'Neckwear/Scarf' },
}

export function flock(name: keyof typeof FLOCK | string, color: Colorway = 'Yellow'): AvatarSpec {
  return { ...FLOCK[name], color }
}

// ---------- contrast helpers: keep characters from melting into their surface ----------
const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
export function luminance(h: string) {
  const [r, g, b] = hexRgb(h).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export function ratio(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/** rough painted area of a shape, used to ignore tiny details when checking contrast */
function area(s: Shape): number {
  if (s.t === 'o') return Math.PI * s.r * s.r
  const nums = (s.d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
  const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1)
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys)
  return s.fill ? w * h * 0.7 : Math.hypot(w, h) * (s.sw ?? 4)
}
const BODY_AREA = 144 * 228 * 0.6

/**
 * Colors that actually meet the surface: the body plus anything that overhangs it
 * (hair, hats). Details drawn *on* the body (glasses, scarves, freckles) never touch the
 * surface, and tiny shapes are ignored.
 */
export function usedColors(spec: AvatarSpec): string[] {
  const way = spec.color
  const body = way === 'Ink' ? COLOR.K : way === 'Orange' ? COLOR.O : COLOR.Y
  const cover = new Map<string, number>()
  for (const id of [backOf(spec.hair), spec.hair, spec.headwear]) {
    if (!id || !PARTS[id]) continue
    for (const s of PARTS[id]) {
      if ((s.a ?? 1) < 0.5) continue
      // a shape with an outline is read by its outline, not its fill
      const f = s.stroke ? undefined : mapColor(s.fill, way, id)
      const k = mapColor(s.stroke, way, id)
      if (f && f !== body) cover.set(f, (cover.get(f) ?? 0) + area(s))
      if (k && k !== body && !s.fill) cover.set(k, (cover.get(k) ?? 0) + area(s))
    }
  }
  return [body, ...[...cover].filter(([, a]) => a / BODY_AREA > 0.025).map(([c]) => c)]
}

export const SURFACE_HEX = {
  paper: '#F7F4EC', soft: '#ECE6D3', white: '#FFFFFF',
  yellow: '#F9CB2F', 'yellow-p': '#FAD559', orange: '#EE6A2C', 'orange-p': '#F18856', ink: '#1E1B16', 'ink-p': '#4B4945',
} as const
export type SurfaceName = keyof typeof SURFACE_HEX

const minRatio = (cols: string[], bg: string) => Math.min(...cols.map((c) => ratio(c, bg)))
export const MIN_CONTRAST = 1.35

/** Keep the preferred surface if the character reads on it; otherwise pick the best brand surface. */
export function safeSurface(spec: AvatarSpec, pref: SurfaceName, allow: SurfaceName[] = Object.keys(SURFACE_HEX) as SurfaceName[]): SurfaceName {
  const cols = usedColors(spec)
  if (minRatio(cols, SURFACE_HEX[pref]) >= MIN_CONTRAST) return pref
  let best = pref, bestScore = -1
  for (const n of allow) {
    const sc = minRatio(cols, SURFACE_HEX[n])
    if (sc > bestScore + 0.02) { bestScore = sc; best = n }
  }
  return best
}

/** A stage + a disc behind the character, both readable against it and against each other. */
export function safePair(spec: AvatarSpec): { stage: SurfaceName; disc: SurfaceName } {
  const cols = usedColors(spec)
  const names = Object.keys(SURFACE_HEX).filter((n) => n !== 'white') as SurfaceName[]
  let best = { stage: 'ink-p' as SurfaceName, disc: 'ink' as SurfaceName }, score = -1
  for (const stage of names) for (const disc of names) {
    if (stage === disc) continue
    const sc = Math.min(minRatio(cols, SURFACE_HEX[stage]), minRatio(cols, SURFACE_HEX[disc]), ratio(SURFACE_HEX[stage], SURFACE_HEX[disc]) * 1.4)
    if (sc > score + 0.01) { score = sc; best = { stage, disc } }
  }
  return best
}

/** A random Persona Kit combo: one head piece (hair or headwear), plus optional eyewear / face / neckwear. */
export function randomSpec(colors: Colorway[] = ['Yellow', 'Ink', 'Orange']): AvatarSpec {
  const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)]
  const spec: AvatarSpec = { color: pick(colors) }
  const head = Math.random() < 0.5 ? 'hair' : 'headwear'
  spec[head] = pick(SLOT_OPTIONS[head]).id
  if (Math.random() < 0.7) spec.eyewear = pick(SLOT_OPTIONS.eyewear).id
  if (Math.random() < 0.4) spec.face = [pick(SLOT_OPTIONS.face).id]
  if (Math.random() < 0.5) spec.neckwear = pick(SLOT_OPTIONS.neckwear).id
  return spec
}

/** Basic logo whose eye alone carries the mood: droopy lid (1-2), half-lid (3), smiling eye (4), happy closed eye (5). */
export function MoodLogo({ level, size = 48 }: { level: 1 | 2 | 3 | 4 | 5; size?: number }) {
  const cx = 76.5, cy = 93.4, r = 28.4
  const id = `eye-${level}`
  // lid line runs from the outer corner (left) to the inner corner (right): outer low = sad
  const lid: Record<number, [number, number]> = { 1: [114, 62], 2: [94, 80], 3: [86, 86] }
  const [yl, yr] = lid[level] ?? [0, 0]
  return (
    <svg width={size} height={(size * 236.25) / 180} viewBox="0 0 180 236.25" aria-hidden="true">
      <defs><clipPath id={id}><circle cx={cx} cy={cy} r={r} /></clipPath></defs>
      <LogoShapes body={COLOR.Y} beak={COLOR.O} />
      <g clipPath={`url(#${id})`}>
        {level <= 3 && (
          <>
            <polygon points={`40,50 114,50 114,${yr} 40,${yl}`} fill={COLOR.Y} />
            <line x1="44" y1={yl} x2="110" y2={yr} stroke={COLOR.K} strokeWidth="7" strokeLinecap="round" />
          </>
        )}
        {level === 5 && <circle cx={cx} cy={cy} r="32" fill={COLOR.Y} />}
      </g>
      {level === 1 && (
        <>
          {/* heartbroken: a steep drooping lid, a worried brow and a tear */}
          <line x1={cx - 30} y1={cy - 30} x2={cx + 24} y2={cy - 56} stroke={COLOR.K} strokeWidth="7.5" strokeLinecap="round" />
          <path d={`M ${cx - 12} ${cy + 24} C ${cx - 20} ${cy + 36} ${cx - 23} ${cy + 43} ${cx - 23} ${cy + 49} a 11 11 0 0 0 22 0 C ${cx - 1} ${cy + 43} ${cx - 4} ${cy + 36} ${cx - 12} ${cy + 24} Z`} fill={COLOR.P} stroke={COLOR.K} strokeWidth="4" strokeLinejoin="round" />
        </>
      )}
      {level === 4 && (
        <>
          {/* excited: bigger pupil with sparkles, a raised brow and happy cheek lines */}
          <circle cx={85.5} cy={101} r={22.5} fill={COLOR.K} />
          <circle cx={93} cy={92} r={6.5} fill={COLOR.P} />
          <circle cx={79} cy={110} r={3.2} fill={COLOR.P} />
          <path d={`M ${cx - 26} ${cy - 35} Q ${cx} ${cy - 56} ${cx + 26} ${cy - 35}`} fill="none" stroke={COLOR.K} strokeWidth="6.5" strokeLinecap="round" />
          <path d={`M ${cx - 24} ${cy + 36} Q ${cx} ${cy + 50} ${cx + 24} ${cy + 36}`} fill="none" stroke={COLOR.K} strokeWidth="6" strokeLinecap="round" />
        </>
      )}
      {level === 5 && <path d={`M ${cx - 24} ${cy + 8} Q ${cx} ${cy - 26} ${cx + 24} ${cy + 8}`} fill="none" stroke={COLOR.K} strokeWidth="8" strokeLinecap="round" />}
    </svg>
  )
}
