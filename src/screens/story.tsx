import {PlaceSearch} from '../PlaceSearch'
import {replacePlannedStop,applyPlannedCheck} from '../route-edit'
import {VenuePhoto} from '../VenuePhoto'
import {demoWalk} from '../demo-walks'
import {RealMap,type RealPin} from '../RealMap'
import {useWalkingRoute} from '../nav'
import {PrivateShare} from '../PrivateCircle'
import {useLiveHoursClock,GoogleAttribution,hoursLabel,VenueEntry} from '../GoogleAttribution'
import type {HoursCheck} from '../data'
import { api, accountError, auth } from '../cloud'
import { useTracking } from '../tracking'
import type { WalkingCheck } from '../data'
import { Photo } from '../CloudPhoto'
import { useEffect, useMemo, useRef, useState } from 'react'
import { photoFiles, photoFromFile } from '../photo'
import { MoodLogo, Persona, flock, safeSurface } from '../brand/Persona'
import { DEFAULT_PREFS, OPENINGS, applyPrefs, buildStory, chapterImg, chapterMeta, draftCaptions, isPhotoTask, noteLines, notePrompt, photoLines, shareText, tripMeters, type Prefs, type Story, type Alt } from '../data'
import { useStore } from '../store'
import { Arrow, BackBtn, BG, Btn, Check, Chip, NoteQuote, SURFACE, Screen$, Sheet, type Bg } from '../ui'
import { SaveSheet } from './home'

export function useStory(): [Story, (fn: (s: Story) => Story) => void] {
  const { s, update } = useStore()
  const story = s.story ?? buildStory(OPENINGS[0])
  // keep the shelf copy in step with what you change, so a story you finished never loses edits
  const set = (fn: (s: Story) => Story) => update((st) => {
    if (!st.story) return st
    const next = fn(st.story)
    return { ...st, story: next, shelf: st.shelf.some((x) => x.id === next.id) ? st.shelf.map((x) => (x.id === next.id ? { ...next, shared: x.shared || next.shared } : x)) : st.shelf }
  })
  return [story as Story, set]
}

const total = (st: Story) => st.chapters.reduce((a, c) => a + c.mins, 0)

// Spread only the fixed overview artwork; its pointer stays on the true coordinate.
function spreadOverview(stops:RealPin[],points:{lat:number;lng:number}[]) {
 const cos=Math.cos(points[0].lat*Math.PI/180)
 const xs=points.map(p=>p.lng*cos),ys=points.map(p=>p.lat)
 const cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2
 const scale=Math.min(274/Math.max(.00001,Math.max(...xs)-Math.min(...xs)),106/Math.max(.00001,Math.max(...ys)-Math.min(...ys)))
 const placed:{x:number;y:number}[]=[]
 return stops.map(p=>{
  const x=177+(p.ll.lng*cos-cx)*scale,y=(cy-p.ll.lat)*scale
  const offset=[0,-32,32,-64,64].find(dx=>x+dx>18&&x+dx<336&&!placed.some(q=>Math.abs(q.x-x-dx)<30&&Math.abs(q.y-y)<40))??0
  placed.push({x:x+offset,y});return {...p,offsetX:offset}
 })
}
function RoutePreview({ story }: { story: Story }) {
  const {account}=useStore()
  const stops=useMemo(()=>story.chapters.map((_,i)=>({id:String(i),ll:{lat:chapterMeta(story,i).lat,lng:chapterMeta(story,i).lng},kind:'dest' as const,number:i+1,size:24})),[story])
  const points=useMemo(()=>[story.origin??{lat:40.7329,lng:-74.0031},...stops.map(p=>p.ll)],[stops,story.origin])
  const walk=useWalkingRoute(account ? points : null)
  const sample=demoWalk(points)
  const overview=useMemo(()=>spreadOverview(stops,points),[stops,points])
  return <div className="route-preview"><div className="route-preview-map"><RealMap compact sampleRoute={!account} pins={overview} fit={points} route={account?walk.route?.geometry:sample} inset={{top:24,bottom:24}} controlsTop={24}/><div className="route-preview-gesture" aria-hidden="true"/></div><div className="route-preview-caption"><span>{walk.route?'Your walking route':account?'Stop locations · checking walking route':sample.length?'Sample walking route':'Sample stop locations'}</span>{account&&walk.status==='error'&&<button onClick={walk.retry}>Retry route</button>}</div></div>
}

export function Details() {
  useLiveHoursClock()
  const { go, reset, say, account } = useStore()
  const tracking=useTracking()
  const mounted=useRef(true)
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
  const [checking,setChecking]=useState(false)
  const [checkError,setCheckError]=useState('')
  const [story, setStory] = useStory()
  const [adjust, setAdjust] = useState(false)
  const [save, setSave] = useState(false)
  const [prefs, setPrefs] = useState<Prefs>(story.prefs ?? DEFAULT_PREFS)
  const groups: [string, keyof Prefs, string[]][] = [
    ['Time to spare', 'time', ['30 min', '60 min', '2 hours']],
    ['Spend a little or a lot?', 'spend', ['Free', '$ Low', '$$ Treat myself']],
    ['Who’s coming?', 'who', ['Solo', 'With friends']],
    ['Getting around', 'move', ['Walking', 'Transit']],
  ]
  return (
    <Screen$ scroll>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <BackBtn onClick={() => reset('home')} />
        <button className="chip" onClick={() => setSave(true)} aria-label="Save this plan to a list"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4.5L6 21z" /></svg>Save for later</button>
      </div>
      <div className="kicker" style={{ marginTop: 14 }}>Your plan for tonight</div>
      <h1 className="h1 h-l details-title" style={{ margin: '6px 0 12px' }}>{story.title.split(' ').slice(0, 2).join(' ')}<br />{story.title.split(' ').slice(2).join(' ')}</h1>
      <div style={{ display: 'flex', margin: '4px 0 14px', padding: '12px 0', borderTop: '1px solid rgba(30,27,22,.14)', borderBottom: '1px solid rgba(30,27,22,.14)' }}>
        {([
          [story.source ? `~${story.estimatedMinutes ?? total(story)} min` : prefs.time === '60 min' ? `${total(story)} min` : prefs.time, 'Time'],
          [story.source ? 'Check prices' : { Free: '$0–5', '$ Low': '$12–20', '$$ Treat myself': '$40+' }[story.prefs?.spend ?? 'Free'] ?? '$0–5', 'Spend'],
          [`${((story.walking?.distance ?? tripMeters(story)) / 1609).toFixed(1)} mi`, story.prefs?.move ?? 'Walking'],
        ] as const).map(([value, label], k) => (
          <div key={label} style={{ flex: 1, paddingLeft: k ? 16 : 0, borderLeft: k ? '1px solid rgba(30,27,22,.14)' : 'none' }}>
            <div style={{ fontWeight: 700, fontSize: 20, letterSpacing: '-.01em', lineHeight: 1.1 }}>{value}</div>
            <div className="kicker" style={{ marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>
      <RoutePreview story={story} />
      <p className="it" style={{ fontSize: 17, margin: '10px 2px' }}>“{story.premise}”</p>
      {story.source&&<>
        <GoogleAttribution hours={story.chapters.map(c=>c.hours)} onMap/>
        <details className="route-notes"><summary>Hours, entry &amp; route details</summary>
          <p>Reported hours are refreshed before starting. Entry, tickets and accessible entrances are not confirmed. Check each venue’s details.</p>
          {story.chapters.map((c,i)=><div key={i}><b className="small">{c.place}</b><VenueEntry hours={c.hours}/></div>)}
          <p>Walking directions may be missing sidewalks or pedestrian paths. Check local signs and conditions.</p>
          <p>Venue catalog: <a href={story.source.attributionURL} target="_blank" rel="noreferrer">Overture Maps</a>.</p>
        </details>
      </>}

      <div className="col" style={{ gap: 6 }}>
        {story.chapters.map((c, i) => {
          const bg: Bg[] = ['yellow-p', 'orange-p', 'ink-p']
          return (
            <div key={i} className="list-row fade-in" style={{ animationDelay: `${i * 0.07}s` }}>
              <div style={{ width: 52, height: 52, borderRadius: 18, background: BG[safeSurface(flock(c.persona, i === 0 ? 'Orange' : 'Yellow'), bg[i % 3] as 'paper') as Bg], overflow: 'hidden', position: 'relative', flex: 'none' }}>
                <div style={{ position: 'absolute', left: 5, top: 8 }}><Persona spec={flock(c.persona, i === 0 ? 'Orange' : 'Yellow')} size={42} /></div>
              </div>
              <div className="col" style={{ flex: 1, textAlign: 'left' }}><b className="h1" style={{ fontSize: 17 }}>{c.title}</b><span className="small muted">{story.source?`${c.kind??'Stop'} · ${hoursLabel(c.hours)}`:c.meta}</span></div>
              <button className="small muted hit44" aria-label={`Swap ${c.place}`} style={{ fontWeight: 700 }} onClick={() => go('swap', { i })}>Swap</button>
            </div>
          )
        })}
      </div>
      <div className="grow" style={{ minHeight: 16 }} />
      {checkError&&<p role="alert" className="small" style={{marginBottom:12}}>{checkError}</p>}
      <div className="row">
        <div style={{ flex: 1 }}><Btn disabled={checking} onClick={async () => {
          if(!story.source){setStory(st=>({...st,status:'active',outingPhase:'active'}));go('active');return}
          if(tracking.mode==='live'&&!tracking.ready){setCheckError('Wait for a fresh, precise GPS position before starting. Check Location Services and try again.');return}
          if(!account||!story.origin||story.chapters.some(c=>!c.ll)){setCheckError('Sign in and choose a nearby detour to check its route.');return}
          setChecking(true);setCheckError('');
          try{
            const origin=tracking.mode==='live'?tracking.pos:story.origin;
            const result=await api<WalkingCheck & {hours:HoursCheck[]}>(account,'/detour-check','POST',{points:[origin,...story.chapters.map(c=>c.ll)],stops:story.chapters.map(c=>({name:c.place,ll:c.ll,mins:c.mins,googlePlaceId:c.googlePlaceId,kind:c.kind,aliases:c.aliases}))});
            const {hours,...walking}=result;
            if(!mounted.current||auth.currentUser?.uid!==account.uid)return;
            const minutes=Math.ceil(walking.duration/60)+story.chapters.reduce((sum,c)=>sum+c.mins,0);
            if(minutes>(story.timeBudgetMinutes??story.estimatedMinutes??120)){setCheckError('The walk now takes longer than this plan allows. Choose another detour or allow more time.');return}
            setStory(st=>st.id===story.id?({...st,origin,walking,estimatedMinutes:minutes,chapters:st.chapters.map((c,i)=>({...c,hours:hours[i],googlePlaceId:hours[i]?.googlePlaceId,googleRoute:true})),status:'active',outingPhase:'active'}):st);go('active');
          }catch(e){setCheckError(accountError(e))}finally{setChecking(false)}
        }}>{checking?'Checking stops…':'Start this story'} {!checking&&<Arrow size={18} />}</Btn></div>
        <Btn kind="soft" inline onClick={() => setAdjust(true)} style={{ width: 110 }}>Adjust</Btn>
      </div>
      {adjust && (
        <Sheet label="Adjust the plan" onClose={() => setAdjust(false)}>
          <div className="kicker">A few small tweaks</div>
          <h2 className="h1 h-s" style={{ margin: '4px 0 12px' }}>Make it your kind of day.</h2>
          {groups.filter(([,key])=>!story.source||key==='who').map(([label, key, opts]) => (
            <div key={key} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{label}</div>
              <div className="chips">{opts.map((o) => <Chip key={o} on={prefs[key] === o} onClick={() => setPrefs((p) => ({ ...p, [key]: o }))}>{o}</Chip>)}</div>
            </div>
          ))}
          {story.source&&<div className="col" style={{gap:8,marginBottom:16}}><h3 className="h1 h-xs">Choose your stops.</h3>{story.chapters.map((chapter,i)=><button className="chip" key={i} onClick={()=>{setAdjust(false);go('swap',{i})}} style={{textAlign:'left',justifyContent:'space-between',minHeight:48}}>{i+1}. {chapter.place}<span>Change →</span></button>)}</div>}
          <Btn onClick={() => { setAdjust(false); setStory((st) => applyPrefs(st, prefs)); say('Plan preferences updated') }}>Update my detour</Btn>
        </Sheet>
      )}
      {save && <SaveSheet story={story} onClose={() => setSave(false)} />}
    </Screen$>
  )
}

export function MomentSheet({ i, story, setStory, onClose }: { i: number; story: Story; setStory: (fn: (s: Story) => Story) => void; onClose: () => void }) {
  const cur = story.moments[i] ?? {}
  const [note, setNote] = useState(cur.note ?? '')
  const [feeling, setFeeling] = useState(cur.feeling ?? '')
  const [img, setImg] = useState<string | undefined>((cur as { img?: string }).img)
  const file = useRef<HTMLInputElement>(null)
  const { say } = useStore()
  const pick = async (f?: File) => {
    if (!f) return
    try { setImg(await photoFromFile(f)) }
    catch { say('Could not open that photo. Try another image.') }
  }
  const c = story.chapters[i]
  return (
    <Sheet label="Add a moment" onClose={onClose}>
      <div className="kicker">Chapter {i + 1} · {c.place}</div>
      <h2 className="h1 h-m" style={{ margin: '4px 0 12px' }}>Add a moment.</h2>
      <button onClick={() => file.current?.click()} className="clip" style={{ width: '100%', height: 150, borderRadius: 28, background: 'var(--soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, position: 'relative' }}>
        {img ? <Photo src={img} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} /> : (<><Persona spec={flock('Juno', 'Orange')} size={90} /><b style={{ fontSize: 14 }}>＋ Add a photo</b></>)}
      </button>
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <div className="field" style={{ margin: '12px 0 10px' }}><input aria-label="One line about this moment" value={note} onChange={(e) => setNote(e.target.value)} placeholder="One line about this moment…" /></div>
      <div className="chips" style={{ marginBottom: 14 }}>{['Cozy', 'Surprising', 'Funny', 'Worth it'].map((f) => <Chip key={f} on={feeling === f} onClick={() => setFeeling(feeling === f ? '' : f)}>{f}</Chip>)}</div>
      <Btn onClick={() => { setStory((s) => ({ ...s, moments: { ...s.moments, [i]: { note, feeling, img } as never } })); onClose() }}>Add to my story</Btn>
    </Sheet>
  )
}

export function Swap() {
  const { route, back, account, s, say } = useStore()
  const [story, setStory] = useStory()
  const i = Number(route.params?.i ?? 0)
  const c = story.chapters[i]
  const [selected,setSelected] = useState<Alt|null>(c.alts[0]??null)
  const [query,setQuery] = useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const mounted=useRef(true)
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
  const live=!!story.source
  const started=!!story.status || !!story.outingPhase && story.outingPhase!=='planned'
  const swap = async () => {
    if(!selected)return
    setError('');setBusy(true)
    try {
      let next:Story
      if(live){
        if(!account||!story.origin)throw new Error('Sign in and choose a starting point first.')
        next=replacePlannedStop(story,i,selected,s.user.age21)
        const result=await api<WalkingCheck & {hours:HoursCheck[]}>(account,'/detour-check','POST',{
          points:[story.origin,...next.chapters.map(ch=>ch.ll)],
          stops:next.chapters.map(ch=>({name:ch.place,ll:ch.ll,mins:ch.mins,googlePlaceId:ch.googlePlaceId,kind:ch.kind,aliases:ch.aliases})),
        })
        next=applyPlannedCheck(next,result)
        if(!mounted.current||auth.currentUser?.uid!==account.uid)return
      }else{
        next={...story,chapters:story.chapters.map((chapter,k)=>k===i?{...chapter,place:selected.place,meta:selected.meta,persona:selected.persona,title:selected.place,desc:'A fresh take on this chapter.',ll:selected.ll,kind:selected.kind}:chapter)}
      }
      if(!mounted.current)return
      setStory(current=>current.id===story.id&&JSON.stringify(current.chapters)===JSON.stringify(story.chapters)?next:current)
      say(live?'Stop updated. Your walking route has been checked.':'Stop updated.');back()
    }catch(e){if(mounted.current)setError(e instanceof Error?e.message:accountError(e))}finally{if(mounted.current)setBusy(false)}
  }
  return (
    <Screen$ scroll>
      <BackBtn />
      <div className="kicker" style={{ marginTop: 14 }}>Rewrite chapter {i + 1}</div>
      <h1 className="h1 h-l" style={{ margin: '6px 0 8px' }}>Another way<br />to go.</h1>
      <p className="body muted" style={{ marginBottom: 14 }}>Choose a nearby suggestion or search for a place you have in mind.</p>
      {live&&!started&&<fieldset disabled={busy} style={{border:0,padding:0,margin:'0 0 18px',minWidth:0}}><PlaceSearch inline value={query} onChange={setQuery} near={c.ll??story.origin!} onChoose={hit=>{setSelected({place:hit.name,meta:hit.address??hit.kind,persona:'Juno',color:'Orange',ll:hit.ll,kind:hit.kind});setError('')}}/></fieldset>}
      {started&&live&&<p className="small" role="status">Choose your stops before starting the walk. Start a new plan to pick different places.</p>}
      <div className="col" style={{ gap: 10 }}>
        {c.alts.map((a) => {
          const on = selected===a
          return (
            <button key={a.place} disabled={busy||live&&started} aria-pressed={on} className="tile row" onClick={() => {setSelected(a);setError('')}} style={{ background: on ? 'var(--yellow-p)' : 'var(--soft)', padding: 16, gap: 14 }}>
              <div style={{ width: 76, height: 84, borderRadius: 22, background: BG[safeSurface(flock(a.persona, a.color), 'paper') as Bg], overflow: 'hidden', position: 'relative', flex: 'none' }}>
                <div style={{ position: 'absolute', left: 6, top: 12 }}><Persona spec={flock(a.persona, a.color)} size={64} /></div>
              </div>
              <div className="col" style={{ flex: 1 }}><b className="h1" style={{ fontSize: 19 }}>{a.place}</b><span className="small">{a.meta}</span></div>
              <span style={{ width: 28, height: 28, borderRadius: 14, background: on ? 'var(--ink)' : 'var(--paper)', color: 'var(--yellow)', display: 'grid', placeItems: 'center' }}>{on && <Check />}</span>
            </button>
          )
        })}
      </div>
      {selected&&!c.alts.includes(selected)&&<div className="card" style={{background:'var(--yellow-p)',padding:20,marginTop:12}}><span className="kicker">Your choice</span><h2 className="h1 h-xs">{selected.place}</h2><p className="small">{selected.meta}</p></div>}
      {live&&<p className="small muted" style={{marginTop:12}}>We check the full walk and reported hours before applying your choice. Entry and prices still need checking.</p>}
      {error&&<p role="alert" className="small" style={{marginTop:12}}>{error}</p>}
      <div className="grow" style={{ minHeight: 16 }} />
      <div className="col" style={{ gap: 10 }}>
        <Btn disabled={!selected||busy||live&&started} onClick={()=>void swap()}>{busy?'Checking your new route…':'Swap this stop'}</Btn>
        <Btn kind="soft" disabled={busy} onClick={back}>Keep original</Btn>
      </div>
    </Screen$>
  )
}

export function Complete() {
  const { s, update, go, reset } = useStore()
  const [story, setStory] = useStory()
  const [photoChapter,setPhotoChapter]=useState<number|null>(null)
  const [providerPhoto,setProviderPhoto]=useState(false)
  // a finished detour goes straight to your shelf, so leaving this screen never loses it
  useEffect(() => {
    update((st) => (st.story && !st.shelf.some((x) => x.id === st.story!.id) ? { ...st, shelf: [{ ...st.story, status: 'done' }, ...st.shelf] } : st))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <Screen$ bg="yellow" scroll>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <BackBtn onClick={() => reset('home')} />
        <span className="kicker">One for the story shelf</span>
      </div>
      <h1 className="h1 h-xl pop" style={{ marginTop: 8, fontSize: 50 }}>The end…<br />for now.</h1>
      <div className="row" style={{ gap: 10, margin: '16px 0' }}>
        {story.chapters.map((chapter, i) => {
          const img = chapterImg(story, i)
          return (
            <div key={i} className="fade-in" style={{ flex: 1, background: 'var(--paper)', borderRadius: 22, padding: 10, animationDelay: `${i * 0.1}s` }}>
              <VenuePhoto chapter={{...chapter,ll:{lat:chapterMeta(story,i).lat,lng:chapterMeta(story,i).lng}}} number={i+1} own={img} onProviderPhoto={()=>setProviderPhoto(true)} onOwnPhoto={()=>setPhotoChapter(i)}/>
              <b className="completion-place-name">{chapter.place}</b>
            </div>
          )
        })}
      </div>
      {providerPhoto&&<div className="venue-gallery-credit"><span>Venue photos</span><img src="/google-maps-dark.svg" height="16" alt="Google Maps"/></div>}
      <div className="card" style={{ background: 'var(--paper)', padding: 22 }}>
        <div className="kicker">{story.title}</div>
        <div className="h1" style={{ fontSize: 21, margin: '4px 0' }}>{story.premise}</div>
        <div className="small muted">{story.chapters.length} chapters · about {total(story) >= 60 ? 'an hour' : `${total(story)} min`} · {s.user.neighborhood}</div>
      </div>
      <div className="grow" />
      <div role="radiogroup" aria-label="Your kind of adventure?" style={{ margin: '16px 0 14px' }}>
        <div style={{ fontWeight: 700, fontSize: 14, margin: '0 4px 10px' }}>Your kind of adventure?</div>
        <div className="row" style={{ justifyContent: 'space-between', background: 'var(--paper)', borderRadius: 32, padding: '12px 18px', gap: 0 }}>
          {([[1, 'Not for me'], [2, 'Not quite'], [3, 'It was fine'], [4, 'Liked it'], [5, 'Loved it']] as const).map(([lv, label]) => {
            const on = story.rating === lv
            return (
              <button key={lv} role="radio" aria-checked={on} aria-label={label} className="hit44"
                onClick={() => setStory((st) => ({ ...st, rating: lv, loved: lv >= 4 }))}
                style={{ width: 52, height: 60, borderRadius: 18, opacity: story.rating && !on ? 0.45 : 1, transform: on ? 'scale(1.18)' : 'none', background: on ? 'var(--yellow-p)' : 'transparent', transition: 'transform var(--motion-t2) var(--ease-spring), opacity var(--motion-t2), background var(--motion-t2)' }}>
                <MoodLogo level={lv} size={38} />
              </button>
            )
          })}
        </div>
      </div>
      <p className="small" style={{ fontWeight: 700, margin: '0 4px 10px' }}>✓ Saved to your story shelf. Share it now, or any time later from You → Your stories.</p>
      <div className="col" style={{ gap: 10 }}>
        <Btn kind="secondary" onClick={() => { update((st) => ({ ...st, story: st.story && { ...st.story, captions: draftCaptions(st.story, st.story.tone) } })); go('tell') }}>Share or edit this story</Btn>
        <Btn kind="soft" onClick={() => reset('home')}>Find another detour</Btn>
      </div>
      {photoChapter!==null&&<MomentSheet i={photoChapter} story={story} setStory={setStory} onClose={()=>setPhotoChapter(null)}/>}
    </Screen$>
  )
}

function ShareSheet({ story, caps, onClose }: { story: Story; caps: string[]; onClose: () => void }) {
  const { s: s0, update, say, reset, account } = useStore()
  const [, setStory] = useStory()
  const [sent, setSent] = useState(false)
  const notes = noteLines(story)
  if(account)return <PrivateShare story={story} onClose={onClose}/>
  const send = async () => {
    const text = shareText(story, caps, s0.user.name || 'Me')
    try {
      const files = await photoFiles(story)
      if (navigator.share) await navigator.share(files.length && navigator.canShare?.({ files }) ? { title: story.title, text, files } : { title: story.title, text })
      else { await navigator.clipboard.writeText(text); say('Copied, paste it anywhere') }
    } catch { /* cancelled */ }
    update((st) => ({ ...st, shelf: [{ ...story, shared: true }, ...st.shelf.filter((x) => x.id !== story.id)], story: st.story && { ...st.story, shared: true } }))
    setSent(true)
  }
  if (sent)
    return (
      <Sheet label="Share your story" onClose={onClose}>
        <div className="col center" style={{ alignItems: 'center', gap: 10, padding: '6px 0 4px' }}>
          <div className="bounce"><Persona spec={flock('Pip', 'Orange')} size={96} /></div>
          <h2 className="h1 h-m">Sent to your circle.</h2>
          <p className="body muted" style={{ maxWidth: 270 }}>Your friends can read it in your words and try their own version.</p>
        </div>
        <div className="col" style={{ gap: 10, marginTop: 16 }}>
          <Btn onClick={() => reset('home')}>See it on Home</Btn>
          <Btn kind="soft" onClick={() => reset('shelf')}>Open my shelf</Btn>
        </div>
      </Sheet>
    )
  return (
    <Sheet label="Tell your friends" onClose={onClose}>
      <div className="kicker">Here’s what your friends will see</div>
      <h2 className="h1 h-s" style={{ margin: '4px 0 10px' }}>{story.title}</h2>
      <div className="field" style={{ height: 'auto', padding: '14px 24px', borderRadius: 24, marginBottom: 12 }}>
        <label>A NOTE TO YOUR FRIENDS (OPTIONAL)</label>
        <textarea maxLength={4000} aria-label="Intro to your friends" rows={2} value={story.intro ?? ''} placeholder="You will not believe who I met…" onChange={(e) => setStory((s) => ({ ...s, intro: e.target.value }))} style={{ width: '100%', fontWeight: 500, fontSize: 15, resize: 'none' }} />
      </div>
      <div className="col" style={{ gap: 12, marginBottom: 14 }}>
        {story.chapters.map((c, i) => (
          <div key={i}>
            <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
              <span className="stop-num">{i + 1}</span>
              <div className="col" style={{ flex: 1 }}><b className="h1" style={{ fontSize: 16 }}>{c.place}</b><span className="small it">{caps[i]}</span></div>
            </div>
            {photoLines(story).filter((p) => p.chapter === i).map((p) => <Photo retryable key={p.task} src={p.img} alt={`Photo: ${p.task}`} style={{ width: 'calc(100% - 44px)', height: 150, objectFit: 'cover', borderRadius: 18, margin: '10px 0 0 44px' }} />)}
            {notes.filter((n) => n.chapter === i).map((n) => (
              <NoteQuote key={n.task} task={n.task} note={n.note} style={{ margin: '10px 0 0 44px' }} />
            ))}
          </div>
        ))}
        {notes.length === 0 && photoLines(story).length === 0 && <p className="small muted">Tip: complete a stop’s tasks and write what happened. That’s where the good stories live.</p>}
      </div>
      <Btn onClick={send}>Send to friends</Btn>
    </Sheet>
  )
}

export function Tell() {
  const { update, go, say, s } = useStore()
  const [story, setStory] = useStory()
  const [share, setShare] = useState(false)
  const tones: Story['tone'][] = ['Cozy', 'Funny', 'Dramatic']
  const caps = story.captions.length ? story.captions : draftCaptions(story, story.tone)
  const bg: Bg[] = ['yellow-p', 'orange-p', 'ink-p']
  useEffect(() => { if (!story.captions.length) setStory((s0) => ({ ...s0, captions: draftCaptions(s0, s0.tone) })) }, [])
  const retone = (t: Story['tone']) => setStory((s0) => ({ ...s0, tone: t, captions: draftCaptions(s0, t) }))
  const save = () => { update((st) => ({ ...st, shelf: [story, ...st.shelf.filter((x) => x.id !== story.id)] })); say('Saved to your story shelf'); go('shelf') }
  return (
    <Screen$ scroll>
      <div className="row" style={{ justifyContent: 'space-between' }}><BackBtn /><button className="back" onClick={() => setShare(true)} aria-label="Share"><Arrow size={20} /></button></div>
      <div className="kicker" style={{ marginTop: 14 }}>Your story, drafted for you</div>
      <div className="card" style={{ margin: '8px 0 12px', padding: '16px 22px' }}>
        <input value={story.title} onChange={(e) => setStory((s0) => ({ ...s0, title: e.target.value }))} className="h1" style={{ fontSize: 28, width: '100%' }} aria-label="Title" />
        <div className="small muted">Tap to edit the title</div>
      </div>
      <div className="chips" style={{ marginBottom: 14 }}>{tones.map((t) => <Chip key={t} on={story.tone === t} onClick={() => retone(t)}>{t}</Chip>)}</div>
      <div className="col" style={{ gap: 18 }}>
        {story.chapters.map((c, i) => {
          const img = chapterImg(story, i)
          const meta = chapterMeta(story, i)
          const doneIds = s.game.done[`${story.id}:${i}`] ?? []
          const doneTasks = meta.tasks.filter((t) => doneIds.includes(t.id))
          return (
            <div key={i} className="fade-in" style={{ animationDelay: `${i * 0.08}s` }}>
              <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
                <div className="clip" style={{ width: 72, height: 84, borderRadius: 22, background: BG[safeSurface(flock(c.persona, i === 0 ? 'Orange' : 'Yellow'), bg[i % 3] as 'paper') as Bg], position: 'relative', flex: 'none' }}>
                  {img ? <Photo src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div className="abs" style={{ left: 6, top: 12 }}><Persona spec={flock(c.persona, i === 0 ? 'Orange' : 'Yellow')} size={60} /></div>}
                </div>
                <div className="col" style={{ flex: 1 }}>
                  <span className="kicker">Chapter {i + 1} · {c.place}</span>
                  <textarea maxLength={4000} aria-label={`Caption for chapter ${i + 1}`} rows={2} value={caps[i] ?? ''} onChange={(e) => setStory((s0) => { const n = [...(s0.captions.length ? s0.captions : caps)]; n[i] = e.target.value; return { ...s0, captions: n } })} className="h1" style={{ fontSize: 16, lineHeight: 1.1, resize: 'none', width: '100%' }} />
                </div>
              </div>
              {doneTasks.length > 0 && (
                <div className="col" style={{ gap: 8, margin: '8px 0 0 84px' }}>
                  {doneTasks.map((t) => {
                    const k = `${i}:${t.id}`
                    return (
                      <div key={t.id} className="quote">
                        <b>{t.text}</b>
                        {isPhotoTask(t) && story.taskPhotos?.[k] && <Photo src={story.taskPhotos[k]} alt={`Photo: ${t.text}`} style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 14, margin: '6px 0' }} />}
                        <textarea maxLength={4000} aria-label={`Your words for ${t.text}`} rows={2} value={story.taskNotes?.[k] ?? ''} placeholder={notePrompt(t)} onChange={(e) => setStory((s0) => ({ ...s0, taskNotes: { ...(s0.taskNotes ?? {}), [k]: e.target.value } }))} style={{ width: '100%', resize: 'none', fontSize: 13, lineHeight: 1.4, fontWeight: 500 }} />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="grow" style={{ minHeight: 18 }} />
      <div className="col" style={{ gap: 10 }}>
        <Btn onClick={() => setShare(true)}>Share with friends</Btn>
        <Btn kind="soft" onClick={save}>Save to story shelf</Btn>
      </div>
      {share && <ShareSheet story={story} caps={caps} onClose={() => setShare(false)} />}
    </Screen$>
  )
}

export { SURFACE }
