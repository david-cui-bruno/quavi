import {useLiveHoursClock,GoogleAttribution,hoursLabel} from '../GoogleAttribution'
import { Photo } from '../CloudPhoto'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BODY_PLAIN, Persona, flock } from '../brand/Persona'
import { ARRIVE_RADIUS, NOTE_STARTERS, chapterMeta, levelName, levelOf, notePrompt, placeInfo, isPhotoTask, TRIP_XP_CAP, taskXp } from '../data'
import { distance, fmtDist, fmtWalk } from '../geo'
import { GameHUD, coinsFor } from '../GameMap'
import { RealMap, useCoinCollect, type RealPin } from '../RealMap'
import { photoFromFile } from '../photo'
import { START, useTracking } from '../tracking'
import { bearingTo, compass, fmtMeters, locateOnRoute, stepText, useWalkingRoute } from '../nav'
import { useStore } from '../store'
import { Arrow, BackBtn, Btn, Check, Round, Screen$, Sheet, StatRow } from '../ui'
import { canArrive } from '../location-session.mjs'
import { useRuntime } from '../runtime'
import { useOutingCheck } from '../use-outing-check'
import { MomentSheet, useStory } from './story'

export function Active() {
  useLiveHoursClock()
  const { s, update, go, reset, say, syncStatus, outingStatus, account } = useStore()
  const tr = useTracking()
  const life = useRuntime()
  const [story, setStory] = useStory()
  const [moment, setMoment] = useState(false)
  const [tasks, setTasks] = useState(false)
  const [preview, setPreview] = useState(true)
  const [gps, setGps] = useState(false)
  const [float, setFloat] = useState<string | null>(null)
  const i = s.chapter
  const c = story.chapters[i]
  const metas = useMemo(() => story.chapters.map((_, k) => chapterMeta(story, k)), [story])
  const meta = metas[i]
  const target = useMemo(() => ({ lat: meta.lat, lng: meta.lng }), [meta.lat, meta.lng])
  const dist = distance(tr.pos, target)
  const recovery=useOutingCheck(story,i)
  const arrivalReady = recovery.ready || (recovery.phase==='offline' && !!story.arrivedStops?.includes(i))
  const arrived = arrivalReady && (tr.mode==='demo' ? dist < ARRIVE_RADIUS : canArrive(dist,tr.fix))
  // far stops on a transit plan are a subway ride, not a walk
  const getThere = (m: number) => (story.prefs?.move === 'Transit' && m > 1500 ? `${Math.max(1, Math.round(m / 250))} min by subway` : fmtWalk(m))
  const key = `${story.id}:${i}`
  const done = s.game.done[key] ?? []
  const allDone = done.length >= meta.tasks.length
  const totalXp = meta.tasks.reduce((a, t) => a + taskXp(story, t), 0)
  const tripEarned = s.game.tripXp?.[story.id] ?? 0

  // ---- turn-by-turn: a real walking route to this stop, with the next instruction ----
  const farTransit = story.prefs?.move === 'Transit' && dist > 1500
  const skipRoute = arrived || farTransit || !recovery.ready
  // the route starts where you are when the stop (or its eligibility) changes; leaving the route asks for a new one
  const points = useMemo(() => (skipRoute ? null : [tr.pos, target]), [skipRoute, target.lat, target.lng]) // eslint-disable-line react-hooks/exhaustive-deps
  const nav = useWalkingRoute(points,recovery.token)
  const loc = nav.route ? locateOnRoute(tr.pos, nav.route) : null
  useEffect(() => { if (loc && loc.off > 40 && !arrived) nav.reroute(tr.pos) }, [loc?.off, arrived]) // eslint-disable-line react-hooks/exhaustive-deps
  // hand the street route to the demo walker once per route (not on every step it takes)
  useEffect(() => { tr.setPath(nav.route ? nav.route.geometry.slice(1) : null); if(story.source&&!nav.route)tr.setWalking(false) }, [nav.route,story.source]) // eslint-disable-line react-hooks/exhaustive-deps
  const [voice, setVoice] = useState(false)

  // what the banner says right now
  type Banner = { kind: string; modifier?: string; big: string; text: string; sub?: string; link?: string }
  let banner: Banner | null = null
  if (!recovery.ready) {
    banner={kind:'head',big:recovery.phase==='offline'?'You’re offline':recovery.phase==='location'?'Waiting for GPS':recovery.phase==='error'?'Check your detour':recovery.phase==='sign-in'?'Sign in to continue':'Checking your detour',text:recovery.phase==='offline'?'Directions and arrival checks are paused.':recovery.phase==='location'?(tr.perm==='denied'?'Allow location in Settings, then retry GPS.':'Waiting for a fresh, precise position.'):recovery.phase==='error'?'Review the message below, then retry.':'Refreshing the walk and reported hours.',sub:'Your plan, notes and progress stay on this device.'}
  } else if (!arrived) {
    if (farTransit) {
      const mins = Math.max(5, Math.round(dist / 250))
      banner = { kind: 'transit', big: 'Take transit', text: `to ${c.place}`, sub: `About ${mins} min · ${fmtMeters(dist)} away`, link: `https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}&travelmode=transit` }
    } else if (nav.route && loc) {
      const first = loc.stepIndex === 0 && loc.along < 30
      const st = first ? nav.route.steps[0] : loc.upcoming
      const isArrive = !first && st.maneuver.type === 'arrive'
      banner = {
        kind: st.maneuver.type, modifier: st.maneuver.modifier,
        big: `${first ? 'For ' : 'In '}${fmtMeters(first ? loc.toUpcoming : loc.toUpcoming)}`,
        text: isArrive ? `Arrive at ${c.place}` : stepText(st.maneuver, st.name, c.place),
        sub: `${fmtMeters(loc.remaining)} to go · ${Math.max(1, Math.round(loc.secondsLeft / 60))} min`,
      }
      if (loc.off > 40) banner = { ...banner, kind: 'reroute', big: 'Off route', text: 'Finding a new way…', sub: undefined }
    } else if (nav.status === 'loading' || nav.status === 'idle') {
      banner = { kind: 'loading', big: 'Finding your route', text: `Walking to ${c.place}` }
    } else {
      banner = story.source ? { kind: 'head', big: 'Directions unavailable', text: 'Pause and check your route', sub: 'Reconnect or open walking directions in your maps app', link: `https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}&travelmode=walking` } : { kind: 'head', big: fmtMeters(dist), text: `Head ${compass(bearingTo(tr.pos, target))} toward ${c.place}`, sub: 'Street directions aren’t available right now' }
    }
  }

  // optional spoken directions: announce each new step once from afar and once when it's close
  const spoken = useRef('')
  const stepKey = loc ? `${key}:${loc.upcomingIndex}` : ''
  useEffect(() => {
    if (!recovery.ready || !life.active || !voice || !banner || !stepKey || !('speechSynthesis' in window)) return
    const close = loc ? loc.toUpcoming < 45 : false
    const tag = `${stepKey}:${close ? 'near' : 'far'}`
    if (spoken.current === tag) return
    spoken.current = tag
    const u = new SpeechSynthesisUtterance(close || !loc ? banner.text : `${banner.big.toLowerCase()}, ${banner.text.charAt(0).toLowerCase()}${banner.text.slice(1)}`)
    u.lang = 'en-US'
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  }, [voice, stepKey, loc?.toUpcoming && loc.toUpcoming < 45]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if ((!voice || !recovery.ready || !life.active) && 'speechSynthesis' in window) window.speechSynthesis.cancel(); return()=>{window.speechSynthesis?.cancel()} }, [voice,recovery.ready,life.active])

  // Aim the explicitly selected demo walker.
  useEffect(() => { tr.setTarget(target) }, [tr, target])


  // Open tasks only after a current, accurate foreground arrival.
  const seen = useRef<Record<string, boolean>>({})
  useEffect(() => {
    if (arrived && !seen.current[key]) {
      seen.current[key] = true
      setStory(st=>st.arrivedStops?.includes(i)?st:{...st,arrivedStops:[...(st.arrivedStops??[]),i]})
      tr.notify(`You’ve arrived at ${c.place}`, `${meta.tasks.length} tasks · ${totalXp} XP waiting`)
      setTasks(true)
    }
  }, [arrived, key, c.place, meta.tasks.length, totalXp, tr])

  // explain each stop before sending someone there
  useEffect(() => { setPreview(true) }, [i])

  const flash = (txt: string) => { setFloat(txt); window.setTimeout(() => setFloat(null), 1400) }

  const award = useCallback((xp: number, coins = 0, badge?: string) => {
    const before = levelOf(s.game.xp)
    const give = Math.max(0, Math.min(xp, TRIP_XP_CAP - (s.game.tripXp?.[story.id] ?? 0)))
    update((st) => ({ ...st, game: { ...st.game, xp: st.game.xp + give, tripXp: { ...(st.game.tripXp ?? {}), [story.id]: (st.game.tripXp?.[story.id] ?? 0) + give }, coins: st.game.coins + coins, badges: badge && !st.game.badges.includes(badge) ? [...st.game.badges, badge] : st.game.badges } }))
    if (levelOf(s.game.xp + give) > before) window.setTimeout(() => say(`Level up! ${levelName(s.game.xp + give)}`), 900)
  }, [s.game.xp, s.game.tripXp, story.id, update, say])

  const complete = (id: string, xp: number) => {
    if (!arrived) return
    if(account){
      const checking=!done.includes(id)
      update(st=>({...st,game:{...st.game,done:{...st.game.done,[key]:checking?[...(st.game.done[key]??[]),id]:(st.game.done[key]??[]).filter(x=>x!==id)}}}))
      flash(checking?'Task saved · XP pending confirmation':'Unchecked · earned XP stays')
      return
    }
    if (done.includes(id)) {
      // tapping a finished task again unchecks it (XP you already earned stays, and the trip cap still applies)
      update((st) => ({ ...st, game: { ...st.game, done: { ...st.game.done, [key]: (st.game.done[key] ?? []).filter((x) => x !== id) } } }))
      flash('Unchecked')
      return
    }
    update((st) => ({ ...st, game: { ...st.game, done: { ...st.game.done, [key]: [...(st.game.done[key] ?? []), id] } } }))
    flash(tripEarned >= TRIP_XP_CAP ? 'Trip XP maxed out' : `+${Math.min(xp, TRIP_XP_CAP - tripEarned)} XP`)
    const finishing = done.length + 1 >= meta.tasks.length
    if (finishing) {
      const firstClear = !(s.game.done[`${key}!`]?.length)
      if (firstClear) update((st) => ({ ...st, game: { ...st.game, done: { ...st.game.done, [`${key}!`]: ['cleared'] } } }))
      window.setTimeout(() => { award(xp, firstClear ? 5 : 0, meta.badge); flash('Chapter cleared!'); if (firstClear) say(`Badge: ${meta.badge}`) }, 1500)
    } else award(xp)
  }

  const collect = useCallback((id: number) => {
    update((st) => {
      const got = st.game.collected[story.id] ?? []
      if (got.includes(id)) return st
      return { ...st, game: { ...st.game, coins: st.game.coins + (account?0:1), collected: { ...st.game.collected, [story.id]: [...got, id] } } }
    })
  }, [update, story.id,account])

  const photoInput = useRef<HTMLInputElement>(null)
  const photoKey = useRef('')
  const takePhoto = async (f?: File) => {
    if (!f || !photoKey.current) return
    const k = photoKey.current
    const img = await photoFromFile(f)
    setStory((st) => ({ ...st, taskPhotos: { ...(st.taskPhotos ?? {}), [k]: img } }))
    flash('Photo added')
  }

  const saveNote = (k: string, text: string) => {
    setStory((st) => ({ ...st, taskNotes: { ...(st.taskNotes ?? {}), [k]: text } }))
  }

  const advance = () => {
    setTasks(false)
    tr.setWalking(false)
    if (i + 1 >= story.chapters.length) { setStory((st) => ({ ...st, status: 'done', outingPhase:'completed' })); go('complete') }
    else update((st) => ({ ...st, chapter: st.chapter + 1 }))
  }

  const route = useMemo(() => [story.origin ?? START, ...metas.map((m) => ({ lat: m.lat, lng: m.lng }))], [metas, story.origin])
  const reached = i + (arrived ? 1 : 0)
  // Live outings draw only the fetched path; later stops are pins rather than invented connecting lines.
  const legRoute = useMemo(() => story.source ? (nav.route?.geometry ?? []) : [...(nav.route ? nav.route.geometry : [tr.pos, target]), ...metas.slice(i + 1).map((m) => ({ lat: m.lat, lng: m.lng }))], [nav.route, i, metas]) // eslint-disable-line react-hooks/exhaustive-deps
  const pins: RealPin[] = metas.map((m, k) => {
    const state = k < i || (k === i && allDone) ? 'done' : k === i ? 'current' : 'locked'
    return { id: String(k), ll: { lat: m.lat, lng: m.lng }, kind: state as RealPin['kind'], label: state === 'current' ? story.chapters[k].place : undefined, selected: false }
  })
  const coins = useMemo(() => coinsFor(route, s.game.collected[story.id] ?? []), [route, s.game.collected, story.id])
  const next = story.chapters[i + 1]
  useCoinCollect(tr.pos, story.source?[]:coins, collect)

  return (
    <Screen$ bg="paper" flush>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 'var(--active-map-bottom, 292px)' }}>
        <RealMap pins={pins} fit={!tr.ready?metas.map(m=>({lat:m.lat,lng:m.lng})):undefined} route={recovery.ready?legRoute:[]}  doneRoute={story.source?undefined:route.slice(0, reached + 1)} coins={story.source?[]:coins} you={tr.ready?tr.pos:undefined} youAvatar={s.user.avatar} follow zoomOnYou={16.5} inset={{ top: banner ? 290 : 170, bottom: 30 }} controlsTop={banner ? 292 : 176} />
      </div>
      <div className="row active-map-header" data-map-top-obstruction style={{ position: 'absolute', left: 24, right: 24, top: 'var(--screen-top, 54px)', zIndex: 8, gap: 10 }}>
        <button className="back" onClick={() => { tr.setWalking(false); reset('home') }} aria-label="Back to Home" style={{ background: 'var(--paper)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12H5M11 5l-7 7 7 7" /></svg>
        </button>
        <div style={{ flex: 1 }}><GameHUDInline /></div>
      </div>
      <div className="active-map-chrome" data-map-top-obstruction>
      {banner && (
        <div className="navbanner" role="status" aria-live="polite">
          <span className="navicon"><ManeuverIcon kind={banner.kind} modifier={banner.modifier} /></span>
          <div className="col" style={{ flex: 1, minWidth: 0 }}>
            <span className="navbig">{banner.big}</span>
            <span className="navtext">{banner.text}</span>
            {banner.sub && <span className="navsub">{banner.sub}</span>}
          </div>
          {banner.link
            ? <a className="navbtn" href={banner.link} target="_blank" rel="noopener noreferrer">Open</a>
            : <button className="navbtn" onClick={() => setVoice((v) => !v)} aria-pressed={voice} aria-label={voice ? 'Turn off spoken directions' : 'Turn on spoken directions'}>{voice ? '🔊' : '🔇'}</button>}
        </div>
      )}
      <button className="status-pill" onClick={() => setGps(true)}><span className="dotlive" />{tr.mode === 'live' ? (tr.ready?'Tracking · My GPS':'GPS · Waiting for location') : 'Tracking · Demo walk'}</button>
      </div>
      {float && <div className="xpfloat">{float}</div>}

      <div data-map-obstruction className="qcard fade-in" key={i}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="kicker">Chapter {i + 1} of {story.chapters.length}</span>
          <span className="pill" style={{ background: arrived ? 'var(--yellow)' : 'var(--soft)' }}>{tr.mode==='live'&&!tr.ready?'Location needed':!recovery.ready?'Walking checks paused':arrived?'✦ You’re here':nav.route?`${fmtMeters(nav.route.distance)} · ${Math.ceil(nav.route.duration/60)} min walk`:story.source?'Route not checked':`${fmtDist(dist)} · ${getThere(dist)}`} </span>
        </div>
        <h1 className="h1" style={{ fontSize: 28, margin: '4px 0 8px' }}>{c.title}</h1>
        <p className="small muted active-stop-summary" style={{ marginBottom: 10 }}>{c.place} · {c.desc}</p>
        <div className="active-stop-stats"><StatRow style={{ marginBottom: 12 }} size={18} stats={[[`${done.length}/${meta.tasks.length}`, 'Tasks'], [`${tripEarned}/${TRIP_XP_CAP}`, 'Trip XP'], [`${c.mins} min`, 'Here']]} /></div>
        {(syncStatus==='storage-full'||outingStatus==='storage-full')&&<p role="alert" className="small" style={{marginBottom:10}}>Device storage is full. Keep Quavi open and free up space; your latest changes may not be saved.</p>}
        {!recovery.ready&&<p className="small" role="status" style={{marginBottom:10}}>{recovery.phase==='offline'?'Saved on this device. Reconnect to refresh directions and hours.':recovery.phase==='location'?tr.locationError||'Waiting for a fresh position. Arrival tasks stay paused.':recovery.message||'Refreshing your outing before continuing.'}</p>}
        <div className="row">
          <div style={{ flex: 1 }}>
            {!recovery.ready&&!arrived ? <Btn kind="soft" disabled={!life.online||recovery.phase==='checking'} onClick={()=>recovery.phase==='sign-in'?go('login'):recovery.phase==='location'?tr.retryLocation():recovery.retry()}>{recovery.phase==='sign-in'?'Log in':recovery.phase==='location'?'Retry GPS':recovery.phase==='checking'?'Checking stops…':'Retry checks'}</Btn> : story.source&&nav.status==='error'&&!arrived ? <Btn kind="soft" onClick={nav.retry}>Retry directions</Btn> : arrived ? <Btn onClick={() => setTasks(true)}>{allDone ? 'See tasks ✓' : 'Open tasks'}</Btn>
              : tr.mode === 'demo' ? <Btn onClick={() => tr.setWalking(!tr.walking)}>{tr.walking ? 'Pause walking' : 'Walk there ▶'}</Btn>
              : <Btn kind="soft" disabled>Walk to {c.place}</Btn>}
          </div>
          <Round kind={allDone ? 'yellow' : 'soft'} onClick={advance} label={next ? 'Next chapter' : 'Finish'} />
        </div>
        <div className="row" style={{ marginTop: 12, justifyContent: 'center', gap: 18 }}>
          <button className="small" style={{ fontWeight: 700 }} onClick={() => setMoment(true)}>＋ Add a moment</button>
          <button className="small" style={{ fontWeight: 700 }} onClick={() => setPreview(true)}>About this stop</button>
          <button className="small" style={{ fontWeight: 700 }} disabled={!!account&&(done.length>0||tripEarned>0)} onClick={() => go('swap', { i })}>Rewrite chapter</button>
        </div>
      </div>

      {preview && recovery.ready && !arrived && !tasks && (
        <Sheet label={`About ${c.place}`} onClose={() => setPreview(false)}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div className="kicker">Next stop · {getThere(dist)}</div>
              <h2 className="h1 h-m" style={{ margin: '4px 0 6px' }}>{c.place}</h2>
              <span className="pill" style={{ background: 'var(--soft)' }}>{c.kind ?? placeInfo(c.place, c.desc).kind}</span>
            </div>
            <div className="wiggle"><Persona spec={flock(c.persona, 'Orange')} size={70} /></div>
          </div>
          <p className="body" style={{ margin: '14px 0 12px' }}>{placeInfo(c.place, c.desc).about}</p>
          {story.source&&<><p className="small">{hoursLabel(c.hours)}{c.hours?.mapsURL&&<> · <a href={c.hours.mapsURL} target="_blank" rel="noreferrer" style={{textDecoration:'underline'}}>Check venue</a></>}</p><GoogleAttribution hours={[c.hours]}/>{[...new Set([...(story.walking?.warnings??[]),...(nav.route?.warnings??[])])].map(w=><p key={w} className="small" style={{marginBottom:8}}>{w}</p>)}</>}
          <p className="small" style={{ margin: '-4px 0 12px', fontWeight: 500 }}>Earn XP toward demo partner rewards in You. Demo offers have no cash value.</p>
          <div className="kicker" style={{ marginBottom: 8 }}>Sidequests here · earn “{meta.badge}”</div>
          <div className="col" style={{ gap: 8, marginBottom: 16 }}>
            {meta.tasks.map((t) => (
              <div key={t.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '12px 16px', borderRadius: 20, background: 'var(--soft)' }}>
                <span style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.3 }}>{t.text}</span>
                <span className="xp">+{taskXp(story, t)}</span>
              </div>
            ))}
          </div>
          <Btn onClick={() => { setPreview(false); if (tr.mode === 'demo') tr.setWalking(true) }}>Let’s go <Arrow size={18} /></Btn>
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
            {c.alts.length > 0 ? <button className="small" style={{ fontWeight: 700, fontSize: 14 }} onClick={() => { setPreview(false); go('swap', { i }) }}>Show other options</button> : <span />}
            <button className="small" style={{ fontWeight: 700, fontSize: 14 }} onClick={() => { setPreview(false); advance() }}>Skip this stop</button>
          </div>
        </Sheet>
      )}

      <input ref={photoInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void takePhoto(e.target.files?.[0]); e.target.value = '' }} />
      {tasks && (
        <Sheet label="Tasks at this stop" onClose={() => setTasks(false)}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div><div className="kicker">{arrived ? 'You’ve arrived' : 'Tasks for this stop'}</div><h2 className="h1 h-m" style={{ margin: '4px 0 2px' }}>{c.place}</h2><span className="small muted">Earn the “{meta.badge}” badge</span></div>
            <div className="wiggle"><Persona spec={flock(c.persona, 'Orange')} size={70} /></div>
          </div>
          <div className="col" style={{ gap: 8, margin: '12px 0' }}>
            {meta.tasks.map((t) => {
              const on = done.includes(t.id)
              const nk = `${i}:${t.id}`
              return (
                <div key={t.id} className={`task-wrap${on ? ' on' : ''}`}>
                  <button disabled={!arrived} className={`task${on ? ' on' : ''}`} aria-pressed={on} onClick={() => complete(t.id, taskXp(story, t))}>
                    <span className="box">{on && <Check size={15} />}</span>
                    <span className="col" style={{ flex: 1, gap: 2 }}><b style={{ fontSize: 14, lineHeight: 1.25 }}>{t.text}</b><span className="small muted">{t.hint}</span></span>
                    <span className="xp">+{taskXp(story, t)}</span>
                  </button>
                  {on && (
                    <div className="note-box fade-in">
                      {isPhotoTask(t) && (
                        <>
                          <div className="kicker" style={{ marginBottom: 6 }}>Your photo · shared with friends</div>
                          <button className="clip" onClick={() => { photoKey.current = nk; photoInput.current?.click() }} aria-label={story.taskPhotos?.[nk] ? 'Replace your photo' : 'Add your photo'}
                            style={{ position: 'relative', width: '100%', height: story.taskPhotos?.[nk] ? 180 : 96, borderRadius: 18, background: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
                            {story.taskPhotos?.[nk]
                              ? <><Photo src={story.taskPhotos[nk]} alt="Your photo for this stop" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} /><span className="pill" style={{ position: 'absolute', right: 10, bottom: 10, background: 'var(--paper)' }}>Replace</span></>
                              : <><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>Add your photo</>}
                          </button>
                          <div className="kicker" style={{ marginBottom: 6 }}>A line about it (optional)</div>
                        </>
                      )}
                      {!isPhotoTask(t) && <div className="kicker" style={{ marginBottom: 6 }}>In your words · shared with friends</div>}
                      <textarea maxLength={4000}
                        aria-label={`In your own words: ${t.text}`}
                        rows={Math.min(7, Math.max(3, Math.ceil((story.taskNotes?.[nk] ?? '').length / 32)))}
                        value={story.taskNotes?.[nk] ?? ''}
                        placeholder={isPhotoTask(t) ? 'What’s the story behind this photo?' : notePrompt(t)}
                        onChange={(e) => saveNote(nk, e.target.value)}
                      />
                      <div className="chips" style={{ marginTop: 6 }}>
                        {NOTE_STARTERS.slice(0, 4).map((s0) => (
                          <button key={s0} className="chip sm" onClick={() => saveNote(nk, ((story.taskNotes?.[nk] ?? '') + (story.taskNotes?.[nk] ? ' ' : '') + s0 + ' ').trimStart())}>{s0}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {done.length > 0 ? <Btn onClick={advance}>{next ? `${allDone ? 'On' : 'Continue'} to ${next.place}` : 'Finish the story'} <Arrow size={18} /></Btn> : <Btn kind="soft" onClick={advance}>Skip tasks</Btn>}
        </Sheet>
      )}

      {gps && (
        <Sheet label="Location tracking" onClose={() => setGps(false)}>
          <div className="kicker">Location</div>
          <h2 className="h1 h-s" style={{ margin: '4px 0 8px' }}>How should Quavi find you?</h2>
          <div className="col" style={{ gap: 10, marginBottom: 12 }}>
            <button className={`task${tr.mode === 'demo' ? ' on' : ''}`} onClick={() => tr.setMode('demo')}><span className="box">{tr.mode === 'demo' && <Check size={15} />}</span><span className="col" style={{ flex: 1 }}><b>Demo walk</b><span className="small muted">Fast-forwards a walker along your route. Great for demos. Choose this explicitly to simulate movement.</span></span></button>
            <button className={`task${tr.mode === 'live' ? ' on' : ''}`} onClick={() => tr.setMode('live')}><span className="box">{tr.mode === 'live' && <Check size={15} />}</span><span className="col" style={{ flex: 1 }}><b>My location</b><span className="small muted">Uses your phone’s GPS. Tasks unlock within {ARRIVE_RADIUS} m of a stop.</span></span></button>
          </div>
          <p className="small muted" style={{ marginBottom: 12 }}>GPS runs while Quavi is open. Locking your phone or leaving the app pauses tracking and spoken directions. Return to refresh your position, walking route and reported hours. No background arrival notifications are sent.</p>
          {tr.mode==='live'&&<><p role="status" className="small" style={{marginBottom:12}}>{tr.ready?`GPS accuracy: about ${Math.round(tr.accuracy??0)} m.`:tr.locationError||'Waiting for a fresh, precise location.'}</p><Btn kind="soft" onClick={tr.retryLocation}>Retry GPS</Btn></>}
          {tr.mode === 'demo' && <Btn kind="soft" onClick={() => { tr.teleport({ lat: meta.lat + 0.0002, lng: meta.lng }); setGps(false) }}>Teleport next to {c.place}</Btn>}
        </Sheet>
      )}
      {moment && <MomentSheet i={i} story={story} setStory={setStory} onClose={() => setMoment(false)} />}
    </Screen$>
  )
}

function GameHUDInline() {
  return <div style={{ position: 'relative' }}><div style={{ position: 'static' }} className="hud-inline"><GameHUD compact /></div></div>
}
export { BackBtn }

/** The arrow for a maneuver: it points the way you need to go. */
function ManeuverIcon({ kind, modifier }: { kind: string; modifier?: string }) {
  if (kind === 'arrive') return <svg width="28" height="28" viewBox="0 24 144 205" aria-hidden="true"><path d={BODY_PLAIN} fill="currentColor" /></svg>
  if (kind === 'transit') return <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="14" rx="3" /><path d="M5 11h14M9 21l2-4M15 21l-2-4" /><circle cx="9" cy="14" r=".8" fill="currentColor" /><circle cx="15" cy="14" r=".8" fill="currentColor" /></svg>
  if (kind === 'loading' || kind === 'reroute') return <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5" /></svg>
  const angle = ({ left: -90, right: 90, 'slight left': -45, 'slight right': 45, 'sharp left': -135, 'sharp right': 135, uturn: 180, straight: 0 } as Record<string, number>)[modifier ?? 'straight'] ?? 0
  return <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: `rotate(${kind === 'head' ? 0 : angle}deg)` }}><path d="M12 20V5M6 11l6-6 6 6" /></svg>
}
