import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flock, safeSurface } from '../brand/Persona'
import { OPENINGS, PLACE_META, chapterMeta, buildStory, categoryTasks, placeInfo, startStory, type Chapter, type Story } from '../data'
import { distance, fmtDist, type LatLng } from '../geo'
import { GameHUD, coinsFor } from '../GameMap'
import { RealMap, useCoinCollect, type RealPin } from '../RealMap'
import { useWalkingRoute } from '../nav'
import { aboutFor, searchPlace, sideQuestsAlong, walkMins, type Found } from '../places'
import { START, useTracking } from '../tracking'
import { useStore } from '../store'
import { Arrow, Btn, PinIcon, Screen$, Check, StatRow } from '../ui'

function Search({ value, onChange, onClear, onBack, onSubmit }: { value: string; onChange?: (v: string) => void; onClear?: () => void; onBack?: () => void; onSubmit?: () => void }) {
  return (
    <div className="abs row" style={{ left: 24, right: 24, top: 54, height: 56, borderRadius: 28, background: 'var(--white)', padding: '0 14px 0 8px', zIndex: 5, gap: 4, boxShadow: '0 4px 18px rgba(30,27,22,.16)' }}>
      {onBack && <button className="hit44" onClick={onBack} aria-label="Back" style={{ flex: 'none' }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 12H5M11 5l-7 7 7 7" /></svg></button>}
      <input aria-label="Search places" value={value} onChange={(e) => onChange?.(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onSubmit?.()} placeholder="Where to?" style={{ flex: 1, minWidth: 0, fontWeight: 500, fontSize: 15, paddingLeft: onBack ? 6 : 16 }} />
      {value && onClear && <button className="hit44" onClick={onClear} style={{ fontSize: 22, color: 'var(--ink-p)', flex: 'none' }} aria-label="Clear">×</button>}
    </div>
  )
}

const QUESTS = [
  { place: 'Corner Coffee', persona: 'Pip' },
  { place: 'Paper & Pine', persona: 'Juno' },
  { place: 'Little Gallery', persona: 'Zed' },
  { place: 'Elm Street Garden', persona: 'Maple' },
  { place: 'Roof 44', persona: 'Luna' },
  { place: 'Dumpling Window', persona: 'Biscuit' },
] as const

/** Every quest on the Explore map as a stop you can open (id = place name). */
function questTrip(): Trip {
  return { dest: SAMPLE_DEST, quests: QUESTS.map((x, i) => ({ id: x.place, name: x.place, ll: { lat: PLACE_META[x.place].lat, lng: PLACE_META[x.place].lng }, kind: placeInfo(x.place).kind, about: placeInfo(x.place).about, off: 90 + i * 20 })) }
}

export function Explore() {
  const { go, say, update, s, account } = useStore()
  const tr = useTracking()
  const [q, setQ] = useState('')
  const submit = () => { if (q.trim()) go('route', { dest: q.trim() }) }
  const surprise = () => { if (account) { go('mood'); return } update((st) => ({ ...st, story: startStory(OPENINGS[Math.floor(Math.random() * 3)], st.user), chapter: 0 })); say('Surprise picked'); go('details') }
  const nearby = account ? (s.story?.source ? s.story.chapters.map((c,i)=>({place:c.place,persona:c.persona,ll:c.ll!,kind:c.kind??'Local spot',about:c.desc,tasks:chapterMeta(s.story!,i).tasks})) : []) : QUESTS.map(x=>({...x,ll:{lat:PLACE_META[x.place].lat,lng:PLACE_META[x.place].lng},kind:placeInfo(x.place).kind,about:placeInfo(x.place).about,tasks:PLACE_META[x.place].tasks}))
  const currentTrip = ():Trip => { const found=nearby.map(x=>({id:x.place,name:x.place,ll:x.ll,kind:x.kind,about:x.about}));return {dest:found[found.length-1],quests:found.slice(0,-1)} }
  const pins: RealPin[] = nearby.map(x=>({id:x.place,ll:x.ll,kind:'quest',label:x.place,quest:true,onClick:()=>go('stop',{trip:account?currentTrip():questTrip(),sel:x.place})}))
  const route = useMemo(()=> account ? (s.story?.source ? [s.story.origin??tr.pos,...s.story.chapters.filter(c=>c.ll).map(c=>c.ll!)] : [tr.pos]) : [START,...QUESTS.slice(0,3).map(x=>({lat:PLACE_META[x.place].lat,lng:PLACE_META[x.place].lng}))],[account,s.story,tr.pos])
  const got = s.game.collected.explore ?? []
  const coins = useMemo(() => coinsFor(route, got), [route, got])
  const collect = useCallback((id: number) => update((st) => { const g = st.game.collected.explore ?? []; return g.includes(id) ? st : { ...st, game: { ...st.game, coins: st.game.coins + 1, collected: { ...st.game.collected, explore: [...g, id] } } } }), [update])
  useCoinCollect(tr.pos, coins, collect)
  const ranked = nearby.map((x) => ({ ...x, d: distance(tr.pos, x.ll) })).sort((a, b) => a.d - b.d)
  const quests = Object.keys(s.game.done).filter((k) => !k.endsWith('!')).length
  return (
    <Screen$ tabs="explore" flush>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 360 }}>
        <RealMap pins={pins} route={route} coins={coins} you={account && !s.story?.source && tr.mode!=='live' ? undefined : tr.pos} youAvatar={s.user.avatar} follow zoomOnYou={16} inset={{ top: 200, bottom: 30 }} />
      </div>
      <div className="hud-inline" style={{ position: 'absolute', left: 24, right: 24, top: 54, zIndex: 8 }}><GameHUD /></div>
      <form className="abs row" onSubmit={(e) => { e.preventDefault(); submit() }} style={{ left: 24, right: 24, top: 114, height: 64, borderRadius: 32, background: 'var(--white)', padding: '0 20px 0 22px', zIndex: 8, gap: 12, boxShadow: '0 4px 18px rgba(30,27,22,.18)' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
        <div className="col" style={{ flex: 1, minWidth: 0 }}>
          <label htmlFor="ex-where" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>Where to?</label>
          <input id="ex-where" aria-label="Where to?" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a place, get detours on the way" style={{ fontWeight: 500, fontSize: 15, width: '100%' }} />
        </div>
        {q ? <button type="button" onClick={() => setQ('')} aria-label="Clear" style={{ fontSize: 22, color: 'var(--ink-p)' }}>×</button> : null}
        {q.trim() && <button type="submit" className="round ink" style={{ width: 40, height: 40 }} aria-label="Find detours"><Arrow size={18} /></button>}
      </form>
      <div data-map-obstruction className="abs" style={{ left: 0, right: 0, bottom: 0, background: 'var(--paper)', borderRadius: '36px 36px 0 0', padding: '18px 0 calc(112px + var(--native-bottom, 0px))', zIndex: 9 }}>
        <div className="row" style={{ justifyContent: 'space-between', padding: '0 24px' }}>
          <div><div className="kicker">{account ? 'Recent detour stops' : 'Demo quests nearby'}</div><h2 className="h1 h-xs" style={{ margin: '2px 0 0' }}>What’s around the corner?</h2></div>
          <span className="pill" style={{ background: 'var(--yellow)' }}>{quests} cleared</span>
        </div>
        <div className="chips scroll" style={{ gap: 10, margin: '12px 0', padding: '0 24px' }}>
          {account && !ranked.length && <p className="small" style={{padding:'10px 0'}}>Choose an area to find real nearby stops.</p>}
          {ranked.map((x, i) => {
            const m = x
            const bgn = safeSurface(flock(x.persona, 'Orange'), (['yellow-p', 'orange-p', 'ink-p'] as const)[i % 3])
            const bg = `var(--${bgn})`
            return (
              <button key={x.place} className="tile" onClick={() => go('stop', { trip: account ? currentTrip() : questTrip(), sel: x.place })} style={{ flex: 'none', width: 140, height: 124, padding: 0, background: bg, color: bgn === 'ink-p' || bgn === 'ink' ? 'var(--paper)' : 'var(--ink)' }}>
                <div className="abs" style={{ right: 16, bottom: 16 }}><PinIcon size={30} color={bgn === 'orange-p' ? '#1E1B16' : '#EE6A2C'} /></div>
                <div className="h1" style={{ position: 'absolute', left: 18, top: 18, right: 40, fontSize: 16, lineHeight: 1.05 }}>{x.place}</div>
                <span className="xp" style={{ position: 'absolute', left: 18, bottom: 40, color: 'var(--ink)' }}>{m.tasks.length} quests</span>
                <span className="small" style={{ position: 'absolute', left: 18, bottom: 18, fontWeight: 500 }}>{fmtDist(x.d)}</span>
              </button>
            )
          })}
        </div>
        <div style={{ padding: '0 24px' }}><Btn kind="secondary" onClick={surprise}>Surprise me with a detour</Btn></div>
      </div>
    </Screen$>
  )
}

type Trip = { dest: Found; quests: Found[] }

const KIND_DUCK: [RegExp, string][] = [[/caf|coffee|tea|bakery|ice|quick|restaurant/i, 'Biscuit'], [/park|garden|play/i, 'Maple'], [/art|gallery|museum|public/i, 'Juno'], [/book|record/i, 'Prof. Quill'], [/bar|pub/i, 'Rex']]
const duckFor = (kind: string, i = 0) => KIND_DUCK.find(([re]) => re.test(kind))?.[1] ?? ['Zed', 'Coco', 'Luna', 'Dax'][i % 4]
const extraMins = (f: Found) => walkMins((f.off ?? 120) * 2)

/** Used when the map services can't be reached: a few real West Village stops from the demo data. */
const SAMPLE_DEST: Found = { id: 'wsp', name: 'Washington Square Park', ll: { lat: 40.7308, lng: -73.9973 }, kind: 'Park', about: aboutFor('Park') }
const sampleQuests = (): Found[] => ([
  ['Corner Coffee', 'Café'], ['Little Gallery', 'Art gallery'], ['Elm Street Garden', 'Garden'],
] as const).map(([name, kind], i) => ({ id: `s${i}`, name, ll: { lat: PLACE_META[name].lat, lng: PLACE_META[name].lng }, kind, about: placeInfo(name).about, off: 90 + i * 30 }))

/** A walk made of real stops: any detours first, then the place you're actually going. */
function tripStory(stops: Found[], origin: LatLng): Story {
  const base = buildStory(OPENINGS[0])
  const dest = stops[stops.length - 1]
  let prev = origin
  const chapters: Chapter[] = stops.map((f, i) => {
    const walk = `${walkMins(distance(prev, f.ll))} min walk`
    prev = f.ll
    return { title: f.name, place: f.name, meta: `${f.name} · ${i === stops.length - 1 ? 'your destination' : '20 min'}`, mins: 20, desc: f.about, walk, persona: duckFor(f.kind, i), color: 'Orange', alts: [], at: [24 + i * 28, 62 - i * 16], ll: f.ll, kind: f.kind }
  })
  return { ...base, id: `trip-${Date.now()}`, origin, title: stops.length > 1 ? `On the way to ${dest.name}` : `To ${dest.name}`, premise: stops.length > 1 ? `Heading to ${dest.name}, with a detour on the way.` : `Heading to ${dest.name}.`, chapters, status: 'active' }
}

/** Up to two detours that are close to the path and different from each other. */
function bestDetours(quests: Found[]): string[] {
  const first = quests[0]
  if (!first) return []
  const second = quests.find((f) => f.id !== first.id && f.kind !== first.kind) ?? quests[1]
  return [first.id, ...(second ? [second.id] : [])]
}

/** How far along the line a → b the point p sits (0 to 1), so detours can be walked in order. */
function along(p: LatLng, a: LatLng, b: LatLng) {
  const k = Math.cos((a.lat * Math.PI) / 180)
  const [bx, by, px, py] = [(b.lng - a.lng) * k, b.lat - a.lat, (p.lng - a.lng) * k, p.lat - a.lat]
  return (px * bx + py * by) / (bx * bx + by * by || 1)
}

export function RouteScreen() {
  const { s, route, go, back, account } = useStore()
  const tr = useTracking()
  const [origin] = useState(tr.pos)
  const typed = String(route.params?.dest ?? 'Washington Square Park')
  const [q, setQ] = useState(typed)
  const [dest, setDest] = useState<Found | null>(null)
  const [quests, setQuests] = useState<Found[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'offline' | 'notfound'>('loading')
  const [looking, setLooking] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const touched = useRef(false)
  const abort = useRef<AbortController | null>(null)

  const run = useCallback(async (query: string) => {
    abort.current?.abort()
    const ac = new AbortController()
    abort.current = ac
    setStatus('loading'); setDest(null); setQuests([]); setLooking(false); setPicked([]); touched.current = false
    try {
      const hits = await searchPlace(query.trim(), origin, ac.signal)
      if (ac.signal.aborted) return
      if (!hits.length) { setStatus('notfound'); return }
      setDest(hits[0]); setStatus('ready'); setLooking(true)
      await sideQuestsAlong(origin, hits[0].ll, hits[0].name, (batch) => setQuests((prev) => [...prev, ...batch].sort((x, y) => (x.off ?? 0) - (y.off ?? 0)).slice(0, 8)), ac.signal, s.user.age21 === false)
      if (!ac.signal.aborted) setLooking(false)
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      if(!account){setDest(SAMPLE_DEST);setQuests(sampleQuests())}
      setStatus('offline');setLooking(false)
    }
  }, [account,origin,s.user.age21])
  useEffect(() => { void run(typed); return () => abort.current?.abort() }, [run, typed])
  // until you pick for yourself, the two nearest different detours are already on your route
  useEffect(() => { if (!touched.current) setPicked(bestDetours(quests)) }, [quests])

  const open = (id: string) => dest && go('stop', { trip: { dest, quests } satisfies Trip, sel: id })
  const { update } = useStore()
  const stops = dest ? quests.filter((f) => picked.includes(f.id)).sort((x, y) => along(x.ll, origin, dest.ll) - along(y.ll, origin, dest.ll)) : []
  const startTrip = (withDetours: boolean) => { if (!dest) return; update((st) => ({ ...st, story: tripStory([...(withDetours ? stops : []), dest], origin), chapter: 0 })); go('active') }
  const toggle = (id: string) => { touched.current = true; setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])) }
  const path = dest ? [origin, ...stops.map((f) => f.ll), dest.ll] : [origin]
  // real street routes: the one through your detours, and the direct one to compare against
  const walk = useWalkingRoute(dest ? path : null)
  const direct = useWalkingRoute(dest && stops.length ? [origin, dest.ll] : null)
  const total = path.slice(1).reduce((m, p, k) => m + distance(path[k], p), 0)
  const mins = dest ? (walk.route ? Math.max(1, Math.round(walk.route.duration / 60)) : walkMins(total)) : null
  const directMins = dest ? (direct.route ? Math.max(1, Math.round(direct.route.duration / 60)) : walkMins(distance(origin, dest.ll))) : 0
  const extra = dest ? Math.max(0, mins! - directMins) : 0
  const pins: RealPin[] = [
    ...(dest ? [{ id: 'dest', ll: dest.ll, kind: 'dest' as const, label: dest.name }] : []),
    ...quests.map((f) => ({ id: f.id, ll: f.ll, kind: 'quest' as const, label: f.name, sub: `+${extraMins(f)} min`, quest: !picked.includes(f.id), selected: picked.includes(f.id), onClick: () => open(f.id) })),
  ]
  const fit = dest ? [origin, dest.ll] : [origin]
  return (
    <Screen$ tabs="explore" flush>
      <div style={{ position: 'relative', flex: 1, marginTop: -54, marginBottom: -108 }}>
        <RealMap pins={pins} route={dest ? (walk.route?.geometry ?? path) : undefined} fit={fit} inset={{ top: 190, bottom: 450 }} you={tr.pos} youAvatar={s.user.avatar} />
        <Search value={q} onChange={setQ} onClear={() => setQ('')} onBack={back} onSubmit={() => q.trim() && void run(q)} />
        <div className="abs row" style={{ left: 24, right: 24, top: 116, height: 46, borderRadius: 23, background: 'var(--ink)', color: 'var(--paper)', padding: '0 22px', zIndex: 5, justifyContent: 'space-between' }}>
          <b style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>You → {dest?.name ?? q}</b>
          <span className="small" style={{ color: 'var(--yellow)', flex: 'none', marginLeft: 10 }}>{mins ? `${mins} min walk` : status === 'loading' ? 'Finding…' : '—'}</span>
        </div>
        <div data-map-obstruction className="abs" style={{ left: 0, right: 0, bottom: 0, background: 'var(--paper)', borderRadius: '36px 36px 0 0', padding: '22px 0 112px', zIndex: 6 }}>
          <div style={{ padding: '0 24px' }}>
            <div className="kicker">{status === 'notfound' ? 'No match' : status === 'offline' ? (account ? 'Place search unavailable' : 'Offline · sample stops') : 'Where you’re going'}</div>
            <h2 className="h1 h-s" style={{ margin: '4px 0 2px' }}>
              {status === 'loading' ? 'Finding your place…' : status === 'notfound' ? 'Try another name.' : status === 'offline' && account && !dest ? 'Try again online.' : dest?.name}
            </h2>
            <p className="body muted" style={{ marginBottom: 12 }}>
              {status === 'notfound' ? 'I couldn’t find that near you. Try the shop’s name and street.'
                : status === 'loading' ? 'Looking it up on the map.' : status === 'offline' && account ? 'Search or nearby suggestions are unavailable. Try the search again; no sample destinations were substituted.'
                : [dest?.kind, dest?.address].filter(Boolean).join(' · ')}
            </p>
            {dest && stops.length > 0 && <p className="small" style={{ fontWeight: 500, margin: '-4px 0 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>You → {stops.map((f) => f.name).join(' → ')} → {dest.name} · {mins} min{extra > 0 ? ` (+${extra} for detours)` : ''}</p>}
            {dest && <Btn onClick={() => startTrip(true)}>{stops.length ? `Start my detour to ${dest.name}` : `Start walking to ${dest.name}`} <Arrow size={18} /></Btn>}
            {dest && stops.length > 0 && <div className="center"><button className="small" style={{ fontWeight: 700, fontSize: 14 }} onClick={() => startTrip(false)}>Go straight there instead</button></div>}
            {dest && <div className="kicker" style={{ margin: '8px 0 8px' }}>{quests.length ? 'Detours on the way · tap to add or remove' : looking ? 'Looking for detours on the way…' : 'No detours right on this path'}</div>}
          </div>
          {dest && quests.length > 0 && (
            <div className="chips scroll" style={{ gap: 12, margin: 0, padding: '0 24px 4px' }}>
              {quests.map((f, i) => (
                <button key={f.id} className="tile" aria-pressed={picked.includes(f.id)} onClick={() => toggle(f.id)} style={{ flex: 'none', width: 164, height: 96, background: i % 2 ? 'var(--soft)' : 'var(--yellow-p)', color: 'var(--ink)', padding: '16px 20px', boxShadow: picked.includes(f.id) ? 'inset 0 0 0 3px var(--ink)' : 'none', filter: picked.includes(f.id) ? 'none' : 'saturate(.8)', transition: 'transform var(--motion-t2) var(--ease-enter), box-shadow var(--motion-t2), filter var(--motion-t3)' }}>
                  {picked.includes(f.id) && <span className="tick" style={{ left: 'auto', bottom: 'auto', right: 12, top: 12, width: 26, height: 26 }}><Check size={14} /></span>}
                  <div className="h1" style={{ fontSize: 16, lineHeight: 1.05, maxWidth: 110 }}>{f.name}</div>
                  <div className="small" style={{ position: 'absolute', left: 20, right: 16, bottom: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.kind} · +{extraMins(f)} min</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Screen$>
  )
}

export function Stop() {
  const { s: appState, route, back, go, update, say } = useStore()
  const tr = useTracking()
  const [origin] = useState(tr.pos)
  const trip = useMemo<Trip>(() => {
    const t = route.params?.trip as Trip | undefined
    return t ?? { dest: SAMPLE_DEST, quests: sampleQuests() }
  }, [route.params?.trip])
  const [sel, setSel] = useState<string>(String(route.params?.sel ?? trip.quests[Number(route.params?.i ?? 0) % trip.quests.length]?.id ?? ''))
  const [added, setAdded] = useState(false)
  const c = trip.quests.find((f) => f.id === sel) ?? trip.quests[0]
  const pins: RealPin[] = [
    { id: 'dest', ll: trip.dest.ll, kind: 'dest', label: trip.dest.name },
    ...trip.quests.map((f) => ({ id: f.id, ll: f.ll, kind: 'quest' as const, label: f.name, quest: true, selected: f.id === c?.id, onClick: () => { setSel(f.id); setAdded(false) } })),
  ]
  const tasks = useMemo(() => (c ? categoryTasks(`${c.name} ${c.kind}`) : []), [c])
  if (!c) return null
  const total = walkMins(distance(origin, c.ll) + distance(c.ll, trip.dest.ll))
  const start = () => {
    update((st) => ({ ...st, story: tripStory([c, trip.dest], origin), chapter: 0 }))
    go('active')
  }
  return (
    <Screen$ tabs="explore" flush>
      <div style={{ position: 'relative', flex: 1, marginTop: -54, marginBottom: -108 }}>
        <RealMap pins={pins} route={added ? [origin, c.ll, trip.dest.ll] : [origin, trip.dest.ll]} fit={[origin, trip.dest.ll, ...trip.quests.map((f) => f.ll)]} inset={{ top: 130, bottom: 430 }} you={tr.pos} youAvatar={appState.user.avatar} />
        <Search value={trip.dest.name} onBack={back} />
        <div data-map-obstruction className="abs" style={{ left: 0, right: 0, bottom: 0, background: 'var(--paper)', borderRadius: '36px 36px 0 0', padding: '20px 24px 112px', zIndex: 6 }}>
          {added ? (
            <>
              <div className="kicker">Your route, with a little extra</div>
              <h2 className="h1 h-s" style={{ margin: '4px 0 12px' }}>Good turn added.</h2>
              <div className="card" style={{ padding: 18, marginBottom: 14 }}><b style={{ fontSize: 14 }}>You → {c.name} → {trip.dest.name}</b><div className="small muted">{total} min walking · +{extraMins(c)} min</div></div>
              <div className="col" style={{ gap: 10 }}><Btn onClick={start}>Start this route <Arrow size={18} /></Btn><Btn kind="soft" onClick={() => setAdded(false)}>Add another stop</Btn></div>
            </>
          ) : (
            <>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <div className="col" style={{ flex: 1 }}><div className="kicker">{c.kind}</div><h2 className="h1 h-m" style={{ marginTop: 4 }}>{c.name}</h2></div>
                <button className="back" onClick={back} aria-label="Close">×</button>
              </div>
              <div className="clip" style={{ background: 'var(--yellow-p)', borderRadius: 28, minHeight: 138, position: 'relative', margin: '10px 0', padding: '20px 24px' }}>
                <p className="body" style={{ width: 188, fontWeight: 500, fontSize: 14 }}>{c.about}</p>
                {c.address && <p className="small muted" style={{ width: 188, marginTop: 8 }}>{c.address}</p>}
                <p className="small" style={{ width: 188, marginTop: 8, fontWeight: 500 }}>Find demo partner rewards in You. No real discount is available at this stop.</p>
                <div className="abs" style={{ right: 28, top: 22 }}><PinIcon size={64} /></div>
              </div>
              <StatRow style={{ marginBottom: 12 }} size={18} stats={[[`+${extraMins(c)} min`, 'Detour'], [String(tasks.length), 'Sidequests']]} />
              <Btn onClick={() => { setAdded(true); say('Stop added') }}>Add stop to my route ＋</Btn>
            </>
          )}
        </div>
      </div>
    </Screen$>
  )
}

export { Check }
