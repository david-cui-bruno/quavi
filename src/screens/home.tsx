import {homeTone} from '../review-home'
import {useSocial} from '../social'
import {CircleStatus,PrivateStory} from '../PrivateCircle'
import {OutingSaveStatus} from '../OutingSaveStatus'
import {useRuntime} from '../runtime'
import { CityPicker, type PlannerStage } from '../CityPicker'
import { useTracking } from '../tracking'
import { useEffect, useState } from 'react'
import { BODY_PLAIN, Persona, flock, safeSurface, type Colorway } from '../brand/Persona'
import { FRIEND_STORIES, MOODS, OPENINGS, noteLines, startStory, type Story, type Opening } from '../data'
import { useStore } from '../store'
import { Arrow, Badge, BackBtn, BG, Btn, Check, Persona$, RatingDucks, Round, SURFACE, Screen$, Sheet, StatRow, onDark, type Bg } from '../ui'

export function SaveSheet({ story, onClose }: { story: Story; onClose: () => void }) {
  const { s, update, say } = useStore()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const faces: [string, Colorway][] = [['Pip', 'Orange'], ['Juno', 'Orange'], ['Coco', 'Orange'], ['Maple', 'Orange'], ['Zed', 'Orange']]
  const toggle = (l: string) =>
    update((st) => {
      const has = st.lists[l]?.includes(story.id)
      return {
        ...st,
        lists: { ...st.lists, [l]: has ? st.lists[l].filter((x) => x !== story.id) : [...(st.lists[l] ?? []), story.id] },
        library: { ...st.library, [story.id]: story },
      }
    })
  const addList = () => {
    const n = name.trim()
    if (!n) return
    update((st) => ({ ...st, lists: { ...st.lists, [n]: [story.id] }, library: { ...st.library, [story.id]: story } }))
    setName(''); setAdding(false)
  }
  return (
    <Sheet label="Save to a list" onClose={onClose}>
      <div className="kicker">Keep this plan for later</div>
      <h2 className="h1 h-s" style={{ margin: '4px 0 10px' }}>Save to a list</h2>
      {Object.keys(s.lists).map((l, i) => {
        const on = s.lists[l].includes(story.id)
        const [pn, pc] = faces[i % faces.length]
        return (
          <button key={l} className="list-row" onClick={() => toggle(l)}>
            <div style={{ width: 54, height: 54, borderRadius: 18, background: BG[safeSurface(flock(pn, pc), on ? 'yellow-p' : 'soft') as Bg], overflow: 'hidden', position: 'relative', flex: 'none' }}>
              <div style={{ position: 'absolute', left: 5, top: 8 }}><Persona spec={flock(pn, pc)} size={44} /></div>
            </div>
            <span style={{ flex: 1, fontWeight: 700, fontSize: 16 }}>{l}</span>
            <span style={{ width: 26, height: 26, borderRadius: 13, background: on ? 'var(--ink)' : 'var(--soft)', color: 'var(--yellow)', display: 'grid', placeItems: 'center' }}>{on && <Check size={14} />}</span>
          </button>
        )
      })}
      {adding ? (
        <div className="field row2" style={{ margin: '8px 0 10px' }}>
          <div><label htmlFor="list-name">LIST NAME</label><input id="list-name" maxLength={80} autoComplete="off" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addList()} placeholder="Rainy days" /></div>
          <button style={{ fontWeight: 700, fontSize: 13 }} onClick={addList}>Add</button>
        </div>
      ) : (
        <button style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink-p)', margin: '8px 2px 14px' }} onClick={() => setAdding(true)}>＋  New list</button>
      )}
      <Btn onClick={() => { onClose(); say('Saved') }}>Save</Btn>
    </Sheet>
  )
}

export function Home() {
  const life=useRuntime()
  const { s, go, update, say, syncStatus, account } = useStore()
  const social=useSocial()
  const tone=homeTone(s.user.homeColor)
  const [ending, setEnding] = useState(false)
  const live = s.story?.status === 'active' ? s.story : undefined
  const at = live ? Math.min(s.chapter, live.chapters.length - 1) : 0
  const mine = s.shelf.find((x) => x.shared)
  const feed = account ? (social.data?.feed??[]).slice(0,4) : [...(mine ? [{ ...mine, author: 'You' }] : []), ...FRIEND_STORIES.filter((f) => s.friends.some((x) => x.name.toLowerCase() === f.author?.toLowerCase()))].slice(0, 4)
  return (
    <Screen$ bg={tone} tabs="home" scroll>
      <div className="row" style={{ gap: 10 }}>
        <Badge size={40} />
        <span className="wordmark" style={{ fontSize: 24 }}>Quavi</span>
        <div style={{ flex: 1 }} />
        {account&&<button className="chip" aria-label={`Notifications${social.data?.notificationsUnread?`, ${social.data.notificationsUnread} unread`:''}`} onClick={()=>go('notifications')} style={{position:'relative',width:44,padding:0,justifyContent:'center'}}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 8H3c0-1 3-1 3-8Z"/><path d="M10 21h4"/></svg>{!!social.data?.notificationsUnread&&<span style={{position:'absolute',right:3,top:2,width:8,height:8,borderRadius:'50%',background:'var(--orange)'}}/>}</button>}
        <span className="pill">📍 {s.user.neighborhood}</span>
      </div>
      {syncStatus==='storage-full'&&<p role="alert" className="small" style={{marginBottom:12}}>Device storage is full. Keep Quavi open and free up space before leaving; your latest changes may not be saved.</p>}
      {!life.online&&syncStatus!=='storage-full'&&<p role="status" className="small" style={{marginBottom:12}}>You’re offline. Saved plans, notes and progress stay on this device. Changes sync when you reconnect.</p>}
      <OutingSaveStatus />
      <div className="kicker" style={{ marginTop: 12 }}>Good evening, {s.user.name}</div>
      <h1 className="h1 h-l" style={{ marginTop: 6 }}>Plans fell through?</h1>
      <p className="it" style={{ fontSize: 20, margin: '6px 0 4px' }}>Good. Let’s find your plot twist.</p>
      <div style={{ position: 'relative', height: 232, margin: '4px calc(var(--gutter) * -1) 0', flex: 'none' }}>
        <button
          onClick={() => (live ? go('active') : go('mood'))}
          className="detour"
          aria-label={live ? 'Continue your unfinished detour' : 'Take a detour'}
          style={{ position: 'absolute', left: '50%', top: 4, width: 156, height: 222, marginLeft: -78, transition: 'transform var(--motion-t1) var(--ease-default)' }}
        >
          <svg viewBox="0 24 144 205" width="156" height="222" aria-hidden="true" style={{ position: 'absolute', inset: 0 }}><path className="shape" d={BODY_PLAIN} style={{fill:tone==='yellow'?'var(--ink)':undefined}} /></svg>
          <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 206, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color:tone==='yellow'?'var(--yellow)':undefined }}>
            {live
              ? <span className="h1" style={{ fontSize: 28, lineHeight: 1 }}>Continue<br />detour</span>
              : <span className="h1" style={{ fontSize: 34, lineHeight: 1 }}>Take a<br />detour</span>}
            <span className="go" style={{ width: 42, height: 42, borderRadius: '50%', background: tone==='yellow'?'var(--yellow)':'var(--ink)', color: tone==='yellow'?'var(--ink)':'var(--yellow)', display: 'grid', placeItems: 'center' }}>
              {live ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg> : <Arrow size={20} />}
            </span>
          </span>
        </button>
      </div>
      {live && (
        <div className="row" style={{ justifyContent: 'space-between', margin: '2px 0 4px' }}>
          <span className="small muted" style={{ fontWeight: 500 }}>Stop {at + 1} of {live.chapters.length} · {live.chapters[at].place}</span>
          <button className="small" style={{ fontWeight: 700, fontSize: 14 }} onClick={() => setEnding(true)}>End detour</button>
        </div>
      )}
      {ending && live && (
        <Sheet label="End this detour?" onClose={() => setEnding(false)}>
          <div className="kicker">{live.title}</div>
          <h2 className="h1 h-m" style={{ margin: '4px 0 8px' }}>End this detour?</h2>
          <p className="body muted" style={{ marginBottom: 16 }}>You’re on stop {at + 1} of {live.chapters.length}. You can wrap it up and tell the story so far, or discard it.</p>
          <div className="col" style={{ gap: 10 }}>
            <Btn onClick={() => { update((st) => ({ ...st, story: st.story && { ...st.story, status: 'done', outingPhase:'completed' } })); setEnding(false); go('complete') }}>End and tell my story</Btn>
            <Btn kind="soft" onClick={() => setEnding(false)}>Keep going</Btn>
            <button className="center small" style={{ fontWeight: 700, fontSize: 14, color: '#A8331A', marginTop: 4 }} onClick={() => { update((st) => ({ ...st, story: undefined, chapter: 0 })); setEnding(false); say('Detour discarded') }}>Discard this detour</button>
          </div>
        </Sheet>
      )}
      <div className="row" style={{ justifyContent: 'space-between', margin: '8px 0 10px' }}>
        <h2 className="h1 h-xs">Stories from your circle</h2>
        <button className="chip" style={{ flex: 'none', paddingRight: 12 }} onClick={() => go('circle')}>See all <Arrow size={16} /></button>
      </div>
      {account&&<CircleStatus/>}
      {feed.length === 0 && (
        <div className="card" style={{ background: 'var(--soft)', padding: '20px 24px', borderRadius: 24 }}>
          <b className="h1" style={{ fontSize: 19 }}>Nothing here yet.</b>
          <p className="body muted" style={{ margin: '4px 0 14px' }}>Add friends to see their stories, or finish a detour and share yours.</p>
          <Btn kind="secondary" inline onClick={() => go('friends')}>Add friends</Btn>
        </div>
      )}
      <div className="stagger" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {feed.map((f, i) => {
          const mine = account ? 'outingId' in f && !!f.outingId : f.author === 'You'
          const sp = mine ? s.user.avatar : flock(['Zed', 'Maple', 'Juno', 'Rex'][i % 4], 'Yellow')
          const bgn = safeSurface(sp, i % 2 ? 'ink-p' : 'orange-p') as Bg
          return (
            <button key={f.id} className="tile" onClick={() => (mine ? go('read', { id: account && 'outingId' in f ? f.outingId : f.id }) : go('friend', { id: f.id }))} style={{ height: 128, background: BG[bgn], color: onDark(bgn) ? 'var(--paper)' : 'var(--ink)', padding: 20 }}>
              <div className="h1" style={{ fontSize: 15, lineHeight: 1.05, maxWidth: 90 }}>{f.title.replace('. A breath of fresh air.', ' & air')}</div>
              <div className="small" style={{ position: 'absolute', left: 20, bottom: 20, fontWeight: 500 }}>{mine ? 'You · just now' : `${f.author} · ${f.chapters.length} stops`}</div>
              <div className="pcs" style={{ right: 0 }}><Persona spec={sp} size={58} /></div>
            </button>
          )
        })}
      </div>
    </Screen$>
  )
}


export function Openings() {
  const {update,go,back,account}=useStore(),tracking=useTracking()
  const [choices,setChoices]=useState<Opening[]>(account?[]:OPENINGS)
  const [stage,setStage]=useState<PlannerStage>(account?'location':'options')
  const [backKey,setBackKey]=useState(0),[refreshKey,setRefreshKey]=useState(0),[refreshing,setRefreshing]=useState(false)
  const [liveOrigin,setLiveOrigin]=useState(false),[notice,setNotice]=useState(''),[sel,setSel]=useState(0)
  const [order,setOrder]=useState([0,1,2])
  const start=()=>{const o=choices[sel];if(!o)return;if(o.origin){tracking.setMode(liveOrigin?'live':'demo');tracking.teleport(o.origin)}update(st=>({...st,story:startStory(o,st.user),chapter:0}));go('writing')}
  const options=stage==='options'
  return <Screen$ bg="yellow">
    <div className="planner-layout">
      <BackBtn onClick={()=>{if(account&&stage!=='location')setBackKey(n=>n+1);else back()}}/>
      <h1 className="h1 h-l planner-title">{stage==='location'?<>Where shall<br/>we wander?</>:stage==='time'?<>How long<br/>do you have?</>:<>Pick your<br/>opening.</>}</h1>
      {account&&<CityPicker onStage={setStage} backKey={backKey} refreshKey={refreshKey} onBusy={setRefreshing} onResults={(result,live)=>{setChoices(result.openings);setOrder(result.openings.map((_,i)=>i));setSel(0);setLiveOrigin(live);setNotice(result.notes.join(' '))}}/>}
      {options&&<>
        <div className="planner-options" role="group" aria-label="Route openings">
          {order.filter(i=>choices[i]).map(oi=>{const o=choices[oi],bg=safeSurface(flock(o.persona,o.color),SURFACE[o.bg] as 'paper') as Bg,dark=onDark(bg),on=sel===oi;return <button key={o.id} onClick={()=>setSel(oi)} aria-pressed={on} className="tile planner-opening" style={{background:BG[bg],color:dark?'var(--paper)':'var(--ink)'}}>
            <div className="planner-opening-copy"><h2 className="h1">{o.title}</h2><p className="small">{o.estimatedMinutes?`~${o.estimatedMinutes} min · ${o.chapters.length} stops`:o.tags}</p><p className="small planner-route">{o.chapters.map(c=>c.place).join(' → ')}</p></div>
            <div className="planner-opening-duck"><Persona spec={flock(o.persona,o.color)} size={76}/></div>{on&&<span className="tick"><Check/></span>}
          </button>})}
          {notice&&<details className="route-notes"><summary>About these routes</summary><p>{notice}</p></details>}
          {choices[0]?.source&&<details className="route-notes"><summary>Venue data</summary><p>Venue catalog: <a href={choices[0].source.attributionURL} target="_blank" rel="noreferrer">Overture Maps</a>.</p></details>}
        </div>
        <div className="planner-footer"><Btn kind="secondary" disabled={refreshing||!choices.length} onClick={start}>Continue <Arrow size={20}/></Btn><button className="text-action" disabled={refreshing||!choices.length} onClick={()=>account?setRefreshKey(n=>n+1):setOrder(o=>[...o.slice(1),o[0]])}>{refreshing?'Finding new openings…':'Shuffle openings'}</button></div>
      </>}
    </div>
  </Screen$>
}

export function Writing() {
  const { go, s } = useStore()
  const [step, setStep] = useState(0)
  useEffect(() => {
    const a = window.setTimeout(() => setStep(1), 900)
    const b = window.setTimeout(() => setStep(2), 1900)
    const c = window.setTimeout(() => setStep(3), 2900)
    const d = window.setTimeout(() => go('details'), 3500)
    return () => [a, b, c, d].forEach(window.clearTimeout)
  }, [go])
  const lines = [
    s.story?.source ? `Found ${s.story.chapters.length} nearby places · checking your route` : 'Previewing three demo stops · hours not checked',
    `Checked your mood: “${(MOODS.find((m) => m.id === s.mood)?.label ?? 'dressed up').toLowerCase()}”`,
    'Picking the twist…',
  ]
  const orbit: [string, Colorway, number][] = [['Pip', 'Orange', 0], ['Luna', 'Ink', 120], ['Zed', 'Orange', 240]]
  return (
    <Screen$ bg="yellow">
      <div className="grow col" style={{ alignItems: 'center', justifyContent: 'center', gap: 22 }}>
        <div style={{ position: 'relative', width: 320, height: 300 }}>
          <div className="spin" style={{ position: 'absolute', inset: 0 }}>
            {Array.from({ length: 60 }).map((_, i) => {
              const a = (i / 60) * Math.PI * 2
              return <i key={i} style={{ position: 'absolute', left: 160 + 138 * Math.cos(a) - 2.5, top: 150 + 130 * Math.sin(a) - 2.5, width: 5, height: 5, borderRadius: '50%', background: 'var(--ink)', opacity: 0.8 }} />
            })}
            {orbit.map(([n, c, deg]) => {
              const a = (deg * Math.PI) / 180
              return (
                <div key={n} style={{ position: 'absolute', left: 160 + 138 * Math.cos(a) - 34, top: 150 + 130 * Math.sin(a) - 42 }}>
                  <div className="spin" style={{ animationDirection: 'reverse' }}><Persona spec={flock(n, c)} size={68} /></div>
                </div>
              )
            })}
          </div>
          <div className="abs" style={{ left: 67, top: 57, width: 186, height: 186, borderRadius: '50%', background: 'var(--ink)', display: 'grid', placeItems: 'center' }}>
            <div className="bounce"><Persona$ name="Pip" size={0} spec={{ color: 'Yellow' }} style={{ display: 'none' }} /><LogoMini /></div>
          </div>
        </div>
        <h1 className="h1 h-m center">Quavi is writing<br />your plot twist…</h1>
        <div className="card" style={{ background: 'var(--paper)', width: '100%', borderRadius: 24, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {lines.map((l, i) => (
            <div key={l} className="row" style={{ opacity: step >= i ? 1 : 0.35, transition: 'opacity var(--motion-t3)' }}>
              <span style={{ width: 24, height: 24, borderRadius: 12, background: step > i ? 'var(--ink)' : 'var(--soft)', color: 'var(--yellow)', display: 'grid', placeItems: 'center' }}>{step > i && <Check size={14} />}</span>
              <span style={{ fontWeight: step > i ? 500 : 700, fontSize: 14 }}>{l}</span>
            </div>
          ))}
        </div>
      </div>
    </Screen$>
  )
}

import { Logo } from '../brand/Persona'
const LogoMini = () => <Logo size={86} />

export function Friend() {
  const { route, go, update, back, account } = useStore()
  const [save, setSave] = useState(false)
  if(account)return <PrivateStory/>
  const f = FRIEND_STORIES.find((x) => x.id === route.params?.id) ?? FRIEND_STORIES[0]
  const write = () => {
    const o = OPENINGS.find((x) => x.id === f.openingId) ?? OPENINGS[0]
    update((st) => ({ ...st, story: startStory(o, st.user), chapter: 0 }))
    go('details')
  }
  return (
    <Screen$ scroll>
      <div className="row"><BackBtn onClick={back} /></div>
      <div className="row" style={{ margin: '12px 0' }}>
        <div style={{ width: 48, height: 48, borderRadius: 24, background: BG[safeSurface(flock(f.author === 'Maya' ? 'Maple' : 'Rex', 'Ink'), 'yellow-p') as Bg], overflow: 'hidden', position: 'relative' }}>
          <div style={{ position: 'absolute', left: 2, top: 4 }}><Persona spec={flock(f.author === 'Maya' ? 'Maple' : 'Rex', 'Ink')} size={44} /></div>
        </div>
        <div className="col"><b style={{ fontSize: 15 }}>{f.author}’s story</b><span className="small muted">{f.date} · West Village</span></div>
      </div>
      <div className="clip" style={{ background: BG[safeSurface(flock(f.author === 'Maya' ? 'Maple' : 'Rex', 'Yellow'), 'ink-p') as Bg], borderRadius: 32, height: 190, position: 'relative', flex: 'none', color: onDark(safeSurface(flock(f.author === 'Maya' ? 'Maple' : 'Rex', 'Yellow'), 'ink-p') as Bg) ? 'var(--paper)' : 'var(--ink)' }}>
        <h1 className="h1 h-s" style={{ position: 'absolute', left: 24, top: 24, width: 190 }}>{f.title}</h1>
        <div className="abs" style={{ right: 12, bottom: -34 }}><Persona spec={flock(f.author === 'Maya' ? 'Maple' : 'Rex', 'Yellow')} size={140} /></div>
      </div>
      <StatRow style={{ margin: '12px 0' }} stats={[[`${f.chapters.reduce((a, c) => a + c.mins, 0)} min`, 'Time'], ['$12–20', 'Spend'], ['1.2 mi', 'Walking']]} />
      <div className="col" style={{ gap: 12 }}>
        {f.chapters.map((c, i) => (
          <div key={i} className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
            <span className="stop-num">{i + 1}</span>
            <div className="col" style={{ flex: 1, minWidth: 0 }}><b className="h1" style={{ fontSize: 17 }}>{c.title}</b><span className="small muted">{c.meta}</span><i className="small it" style={{ marginTop: 2 }}>“{f.captions[i]}”</i>{noteLines(f).filter((n) => n.chapter === i).map((n) => <NoteDrop key={n.task} task={n.task} note={n.note} />)}</div>
          </div>
        ))}
      </div>
      <div className="grow" style={{ minHeight: 18 }} />
      <div className="row"><div style={{ flex: 1 }}><Btn onClick={write}>Write my own version</Btn></div><Round kind="soft" onClick={() => setSave(true)} label="Save" /></div>
      {save && <SaveSheet story={f} onClose={() => setSave(false)} />}
    </Screen$>
  )
}

export function Circle() {
  const { s, go, account, say } = useStore()
  const social=useSocial()
  const mine = s.shelf.filter((x) => x.shared).map((x) => ({ ...x, author: 'You' }))
  const all = account ? social.data?.feed??[] : [...mine, ...FRIEND_STORIES.filter((f) => s.friends.some((x) => x.name.toLowerCase() === f.author?.toLowerCase()))]
  return (
    <Screen$ scroll tabs="home">
      <BackBtn />
      <div className="kicker" style={{ marginTop: 14 }}>Your circle</div>
      <h1 className="h1 h-l" style={{ margin: '6px 0 16px' }}>Stories from<br />your circle.</h1>
      {account&&<CircleStatus/>}
      {all.length === 0 && (
        <div className="col" style={{ gap: 12 }}>
          <div className="card" style={{ background: 'var(--soft)', padding: '20px 24px', borderRadius: 24 }}>
            <b className="h1" style={{ fontSize: 19 }}>Nothing here yet.</b>
            <p className="body muted" style={{ margin: '4px 0 14px' }}>Stories you and your friends share show up here. Add friends to start your circle.</p>
            <Btn kind="secondary" inline onClick={() => go('friends')}>Add friends</Btn>
          </div>
        </div>
      )}
      <div className="circle-feed stagger">
        {all.map((f, i) => {
          const isMine = account ? 'outingId' in f && !!f.outingId : f.author === 'You'
          const sp = isMine ? s.user.avatar : flock(['Zed', 'Maple', 'Juno', 'Rex'][i % 4], 'Yellow')
          const bgn = safeSurface(sp, (['orange-p', 'ink-p', 'yellow-p'] as const)[i % 3]) as Bg
          const dark = onDark(bgn)
          return (
            <button key={f.id + i} className="tile" onClick={() => (isMine ? go('read', { id: account && 'outingId' in f ? f.outingId : f.id }) : go('friend', { id: f.id }))} style={{ height: isMine && 'rating' in f && f.rating ? 176 : 148, background: BG[bgn], color: dark ? 'var(--paper)' : 'var(--ink)', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10 }}>
              <div className="h1" style={{ fontSize: 20, lineHeight: 1.05, maxWidth: 200 }}>{f.title}</div>
              <div className="small" style={{ fontWeight: 500 }}>{isMine ? 'You' : f.author} · {f.chapters.length} stops · {f.date}</div>
              {isMine && 'rating' in f && f.rating && <div style={{ marginTop: 8 }}><RatingDucks rating={f.rating} /></div>}
              <div className="pcs" style={{ right: 4 }}><Persona spec={sp} size={80} /></div>
            </button>
          )
        })}
      </div>
      {account&&social.data?.feedCursor&&<button className="btn soft" onClick={()=>void social.loadMore().catch(()=>say('Could not load older stories. Try again.'))}>Load older stories</button>}
    </Screen$>
  )
}

/** One comment folded away until you tap it, so a story with lots of notes stays short to scroll. */
function NoteDrop({ task, note }: { task: string; note: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginTop: 8, borderRadius: 20, background: 'var(--soft)', overflow: 'hidden' }}>
      <button aria-expanded={open} onClick={() => setOpen(!open)} className="row" style={{ width: '100%', justifyContent: 'space-between', gap: 10, minHeight: 44, padding: '10px 16px 10px 20px', textAlign: 'left' }}>
        <span style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.3, flex: 1, minWidth: 0, ...(open ? {} : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }) }}>{task}</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--motion-t2) var(--ease-default)' }}><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && <p className="fade-in" style={{ padding: '0 20px 16px', fontSize: 15, lineHeight: 1.45 }}>“{note}”</p>}
    </div>
  )
}
