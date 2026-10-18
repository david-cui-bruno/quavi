import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth'
import { auth, accountError } from '../cloud'
import { useEffect, useMemo, useState } from 'react'
import { Logo, Persona, flock, randomSpec, safePair, safeSurface, type AvatarSpec, type Colorway } from '../brand/Persona'
import { SLOT_OPTIONS, type Slot } from '../brand/partsData'
import { INTERESTS, INTEREST_SPEC, MOODS } from '../data'
import { useStore } from '../store'
import { Arrow, Badge, BackBtn, BG, Btn, Check, Chip, Round, SURFACE, Screen$, onDark, type Bg } from '../ui'

export function Splash() {
  const { go } = useStore()
  useEffect(() => {
    const t = window.setTimeout(() => go('welcome'), 1900)
    return () => window.clearTimeout(t)
  }, [go])
  return (
    <Screen$ bg="ink">
      <div className="grow col center" style={{ alignItems: 'center', justifyContent: 'center', gap: 18 }} onClick={() => go('welcome')}>
        <div className="pop"><Logo size={150} /></div>
        <div className="wordmark fade-in" style={{ fontSize: 54, color: 'var(--paper)', animationDelay: '.15s' }}>Quavi</div>
        <div className="it fade-in" style={{ fontSize: 20, color: 'var(--yellow)', animationDelay: '.3s' }}>Take the long way.</div>
      </div>
    </Screen$>
  )
}

export function Welcome() {
  const { go } = useStore()
  // a fresh, random flock every visit; Yellow is left out because it vanishes on the yellow screen
  const crew = useMemo(() => Array.from({ length: 8 }, () => randomSpec(['Ink', 'Orange'])), [])
  return (
    <Screen$ bg="yellow">
      <div className="row" style={{ gap: 10 }}>
        <Badge /> <span className="wordmark" style={{ fontSize: 26 }}>Quavi</span>
      </div>
      <h1 className="h1 h-xl" style={{ marginTop: 28 }}>Plans fell<br />through?<br />Good.</h1>
      <p className="body" style={{ marginTop: 14 }}>You’re already dressed and out the door. Let’s turn tonight into a story worth telling.</p>
      <div className="grow" />
      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {[...crew, ...crew].map((spec, i) => (
            <div key={i} className="marquee-item" style={{ animationDelay: `${(i % crew.length) * -0.37}s` }}><Persona spec={spec} size={126} /></div>
          ))}
        </div>
      </div>
      <Btn kind="secondary" onClick={() => go('login')}>Log in or create an account</Btn>
      <button className="center small" style={{ fontWeight: 700, fontSize: 14, marginTop: 10, minHeight: 44 }} onClick={() => go('about')}>Explore the demo</button>
    </Screen$>
  )
}

export function Login() {
  const { say } = useStore()
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState<{ email?: string; pw?: string }>({})
  const [signup, setSignup] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const enter = async () => {
    const e: { email?: string; pw?: string } = {}
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = 'Enter an email like name@email.com'
    if (pw.length < (signup ? 8 : 6)) e.pw = signup ? 'Use at least 8 characters' : 'Enter your password'
    setErr(e)
    if (e.email || e.pw) return
    setBusy(true); setFailure('')
    try {
      if (signup) await createUserWithEmailAndPassword(auth, email.trim(), pw)
      else await signInWithEmailAndPassword(auth, email.trim(), pw)
    } catch (error) { setFailure(accountError(error)) }
    finally { setBusy(false) }
  }
  return (
    <Screen$ bg="paper" scroll>
      <div className="abs bounce" style={{ right: -26, top: 10, zIndex: 0 }}>
        <Persona spec={flock('Juno', 'Orange')} size={190} />
      </div>
      <div style={{ position: 'relative', zIndex: 1 }}><BackBtn /></div>
      <h1 className="h1 h-xl" style={{ marginTop: 92 }}>{signup ? <>Your next<br />chapter.</> : <>Welcome<br />back.</>}</h1>
      <p className="body muted" style={{ margin: '10px 0 18px' }}>{signup ? 'Create an account to save your stories across devices.' : 'Pick up where your last detour left off.'}</p>
      <div className="col" style={{ gap: 10 }}>
        <div className={`field${err.email ? ' bad' : ''}`}><label htmlFor="li-email">EMAIL</label><input id="li-email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" inputMode="email" aria-invalid={!!err.email} aria-describedby={err.email ? 'li-email-e' : undefined} /></div>
        {err.email && <div className="err" id="li-email-e" role="alert">{err.email}</div>}
        <div className={`field row2${err.pw ? ' bad' : ''}`}>
          <div><label htmlFor="li-pw">PASSWORD</label><input id="li-pw" value={pw} onChange={(e) => setPw(e.target.value)} type={show ? 'text' : 'password'} autoComplete={signup ? 'new-password' : 'current-password'} aria-invalid={!!err.pw} aria-describedby={err.pw ? 'li-pw-e' : undefined} /></div>
          <button className="small muted" style={{ fontWeight: 700 }} aria-pressed={show} onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
        </div>
        {err.pw && <div className="err" id="li-pw-e" role="alert">{err.pw}</div>}
      </div>
      <div className="grow" />
      <div className="col" style={{ gap: 10 }}>
        {failure && <p className="err" role="alert">{failure}</p>}
        <Btn kind="secondary" onClick={() => void enter()} disabled={busy}>{busy ? 'Connecting…' : signup ? 'Create account' : 'Log in'}</Btn>
        <button className="center" disabled={busy} style={{ fontWeight: 700, fontSize: 14, minHeight: 44 }} onClick={() => { setSignup(!signup); setFailure(''); setErr({}) }}>{signup ? 'Already have an account? Log in' : 'New here? Create account'}</button>
        {!signup && <button className="center small" disabled={busy} style={{ minHeight: 44 }} onClick={async () => {
          if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setErr({ email: 'Enter your email first' }); return }
          setBusy(true); setFailure('')
          try { await sendPasswordResetEmail(auth, email.trim()); say('If this email has an account, a reset link is on its way.') }
          catch (error) { setFailure(accountError(error)) }
          finally { setBusy(false) }
        }}>Forgot password?</button>}
      </div>
    </Screen$>
  )
}

/** Name, age (for drink spots) and who you go out with. Also opened from You to edit them later. */
export function About() {
  const { s, update, go, back, route } = useStore()
  const editing = route.params?.editing === true
  const [name, setName] = useState(s.user.name)
  const [age21, setAge21] = useState<boolean | undefined>(s.user.age21)
  const [who, setWho] = useState<'Solo' | 'With friends'>(s.user.who ?? 'Solo')
  const ready = name.trim().length > 0 && age21 !== undefined
  const save = () => {
    update((st) => ({ ...st, user: { ...st.user, name: name.trim(), age21, who } }))
    if (editing) back()
    else go('interests')
  }
  return (
    <Screen$ scroll>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <BackBtn />
        <span className="kicker">{editing ? 'Edit profile' : '1 of 4'}</span>
      </div>
      <h1 className="h1 h-m" style={{ margin: '14px 0 16px' }}>{editing ? 'Your profile.' : 'Let’s start with you.'}</h1>
      <div className="field" style={{ marginBottom: 20 }}>
        <label htmlFor="ab-name">YOUR NAME</label>
        <input id="ab-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="What should we call you?" autoComplete="given-name" maxLength={24} />
      </div>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Are you 21 or older?</div>
      <p className="small muted" style={{ marginBottom: 10 }}>If not, we’ll leave out bars, pubs and wine spots.</p>
      <div className="chips" style={{ marginBottom: 20 }} role="radiogroup" aria-label="Are you 21 or older?">
        <Chip on={age21 === true} onClick={() => setAge21(true)}>Yes, 21+</Chip>
        <Chip on={age21 === false} onClick={() => setAge21(false)}>Not yet</Chip>
      </div>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Who are you usually out with?</div>
      <p className="small muted" style={{ marginBottom: 10 }}>This sets your sidequests. You can change it for any plan.</p>
      <div className="chips" role="radiogroup" aria-label="Who are you usually out with?">
        <Chip on={who === 'Solo'} onClick={() => setWho('Solo')}>Just me</Chip>
        <Chip on={who === 'With friends'} onClick={() => setWho('With friends')}>With friends</Chip>
      </div>
      <div className="grow" style={{ minHeight: 24 }} />
      <Btn onClick={save} disabled={!ready}>{editing ? 'Save profile' : 'Continue'} <Arrow size={18} /></Btn>
    </Screen$>
  )
}

export function Interests() {
  const { s, update, go } = useStore()
  const toggle = (id: string) =>
    update((st) => ({ ...st, user: { ...st.user, interests: st.user.interests.includes(id) ? st.user.interests.filter((x) => x !== id) : [...st.user.interests, id] } }))
  return (
    <Screen$>
      <BackBtn />
      <div className="kicker" style={{ marginTop: 14 }}>A little about you · 2 of 4</div>
      <h1 className="h1 h-l" style={{ margin: '6px 0 16px' }}>What catches<br />your eye?</h1>
      <div className="stagger" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {INTERESTS.map((it, i) => {
          const on = s.user.interests.includes(it.id)
          const spec = INTEREST_SPEC[it.id] ?? flock(it.persona, it.color)
          const bg = safeSurface(spec, SURFACE[it.bg] as 'paper') as Bg
          const dark = onDark(bg)
          return (
            <button key={it.id} className={`tile${on ? ' on' : ''}`} aria-pressed={on} onClick={() => toggle(it.id)} style={{ background: BG[bg], height: 138, color: dark ? 'var(--paper)' : 'var(--ink)', borderRadius: i % 2 ? '22px 34px 34px 22px' : '34px 22px 22px 34px', filter: on ? 'none' : 'saturate(.8)', boxShadow: on ? `inset 0 0 0 3px ${dark ? 'var(--yellow)' : 'var(--ink)'}` : 'none', transition: 'transform var(--motion-t2) var(--ease-enter), filter var(--motion-t3) var(--ease-default), box-shadow var(--motion-t2)' }}>
              <div style={{ fontWeight: 700, fontSize: 15, maxWidth: 60, lineHeight: 1.15 }}>{it.label}</div>
              <div className="pcs" style={{ right: 0 }}><Persona spec={spec} size={86} /></div>
              {on && <span className="tick" style={{ left: 'auto', bottom: 'auto', right: 16, top: 16, width: 36, height: 36, ...(dark ? { background: 'var(--yellow)', color: 'var(--ink)' } : {}) }}><Check size={20} /></span>}
            </button>
          )
        })}
      </div>
      <div className="grow" />
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 20 }}>
        <button className="small muted" style={{ fontWeight: 700, fontSize: 14 }} onClick={() => { update((st) => ({ ...st, user: { ...st.user, interests: [] } })); go('customize') }}>I’m open to anything</button>
        <Round size={56} onClick={() => go('customize')} />
      </div>
    </Screen$>
  )
}

const SLOTS: { id: Slot; label: string }[] = [
  { id: 'hair', label: 'Hair' }, { id: 'headwear', label: 'Hats' }, { id: 'eyewear', label: 'Eyes' }, { id: 'face', label: 'Face' }, { id: 'neckwear', label: 'Neck' },
]

function withSlot(spec: AvatarSpec, slot: Slot, id: string | null): AvatarSpec {
  const next = { ...spec }
  if (slot === 'face') next.face = id ? [id] : []
  else if (slot === 'hair') next.hair = id ?? undefined
  else if (slot === 'headwear') next.headwear = id ?? undefined
  else if (slot === 'eyewear') next.eyewear = id ?? undefined
  else next.neckwear = id ?? undefined
  return next
}
function currentOf(spec: AvatarSpec, slot: Slot) {
  return slot === 'face' ? spec.face?.[0] : (spec[slot] as string | undefined)
}

export function Customize() {
  const { s, update, go, back, route } = useStore()
  const editing = route.params?.editing === true
  const [slot, setSlot] = useState<Slot>('headwear')
  const spec = s.user.avatar
  const set = (a: AvatarSpec) => update((st) => ({ ...st, user: { ...st.user, avatar: a } }))
  const opts = SLOT_OPTIONS[slot]
  const cur = currentOf(spec, slot)
  const { stage: stageName, disc: discName } = safePair(spec)
  return (
    <Screen$>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <BackBtn />
        <span className="kicker">{editing ? 'Edit' : '3 of 4'}</span>
      </div>
      <h1 className="h1 h-m" style={{ margin: '12px 0' }}>Make your Quavi.</h1>
      <div className="clip" style={{ background: BG[(stageName === 'paper' ? 'soft' : stageName) as Bg], borderRadius: 36, height: 290, position: 'relative', flex: 'none', display: 'grid', placeItems: 'center', transition: 'background var(--motion-t3)' }}>
        <div className="abs" style={{ width: 196, height: 196, borderRadius: '50%', background: BG[discName as Bg], top: 50, transition: 'background var(--motion-t3)' }} />
        <div key={JSON.stringify(spec)} className="pop" style={{ position: 'relative', left: 11, marginTop: 8 }}><Persona spec={spec} size={196} /></div>
        <span className="pill abs" style={{ left: 20, top: 20, background: 'var(--paper)' }}>{s.user.name} · you</span>
        <button className="pill abs" style={{ right: 20, top: 20, background: 'var(--paper)' }} onClick={() => set({ ...flock(['Pip', 'Juno', 'Luna', 'Rex', 'Coco', 'Zed', 'Poppy', 'Dax'][Math.floor(Math.random() * 8)]), color: (['Yellow', 'Ink', 'Orange'] as Colorway[])[Math.floor(Math.random() * 3)] })}>🎲 Surprise me</button>
      </div>
      <div className="chips scroll" style={{ marginTop: 12 }}>
        {SLOTS.map((x) => <Chip key={x.id} on={slot === x.id} onClick={() => setSlot(x.id)}>{x.label}</Chip>)}
      </div>
      <div className="chips scroll" style={{ marginTop: 10, gap: 10, paddingBottom: 4 }}>
        {[{ id: null as string | null, label: 'None' }, ...opts].map((o) => {
          const on = (cur ?? null) === o.id
          const prev = withSlot({ ...spec }, slot, o.id)
          const name = safeSurface(prev, 'ink-p') as Bg
          const dark = onDark(name)
          return (
            <button key={o.id ?? 'none'} className="tile" aria-pressed={on} onClick={() => set(prev)} style={{ flex: 'none', width: 88, height: 104, borderRadius: 22, padding: 0, background: BG[name], transform: on ? 'scale(1.06)' : undefined, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', transition: 'background var(--motion-t3), transform var(--motion-t2) var(--ease-spring)' }}>
              <div style={{ position: 'absolute', top: 10, left: 14 }}><Persona spec={prev} size={60} /></div>
              {on && <span className="tick" style={{ left: 'auto', right: 6, top: 6, bottom: 'auto', width: 20, height: 20, background: dark ? 'var(--yellow)' : 'var(--ink)', color: dark ? 'var(--ink)' : 'var(--yellow)' }}><Check size={11} /></span>}
              <span style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, padding: '0 6px', color: dark ? 'var(--paper)' : 'var(--ink)', position: 'relative' }}>{o.label}</span>
            </button>
          )
        })}
      </div>
      <div className="row" style={{ justifyContent: 'space-between', margin: '10px 2px 0' }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>Colorway</span>
        <div className="row" style={{ gap: 12 }}>
          {(['Yellow', 'Ink', 'Orange'] as Colorway[]).map((c) => (
            <button key={c} aria-label={`${c} colorway`} aria-pressed={spec.color === c} onClick={() => set({ ...spec, color: c })} style={{ width: 44, height: 44, padding: spec.color === c ? 4 : 8, borderRadius: '50%', background: c === 'Yellow' ? 'var(--yellow)' : c === 'Ink' ? 'var(--ink)' : 'var(--orange)', backgroundClip: 'content-box', transition: 'padding var(--motion-t2) var(--ease-spring)' }} />
          ))}
        </div>
      </div>
      <div className="grow" />
      <Btn onClick={() => (editing ? back() : go('home'))}>{editing ? 'Save' : 'Looks like me'}</Btn>
    </Screen$>
  )
}

export function Mood() {
  const { s, update, go } = useStore()
  const [sel, setSel] = useState(s.mood ? Math.max(0, MOODS.findIndex((m) => m.id === s.mood)) : 2)
  const pick = (i: number) => { setSel(i); update((st) => ({ ...st, mood: MOODS[i].id })) }
  return (
    <Screen$ bg="orange">
      <BackBtn />
      <h1 className="h1 h-m" style={{ marginTop: 14 }}>Plans fell through.<br />What happened?</h1>
      <div className="col" role="radiogroup" aria-label="What happened?" style={{ gap: 10, margin: '22px 0 0' }}>
        {MOODS.map((m, i) => {
          const on = sel === i
          return (
            <button key={m.id} role="radio" aria-checked={on} onClick={() => pick(i)} className="row"
              style={{ height: 74, borderRadius: 37, padding: '0 24px 0 14px', gap: 14, justifyContent: 'flex-start', background: on ? 'var(--ink)' : 'var(--paper)', color: on ? 'var(--paper)' : 'var(--ink)', transition: 'background var(--motion-t2), color var(--motion-t2), transform var(--motion-t2) var(--ease-spring)', transform: on ? 'scale(1.02)' : 'none' }}>
              <span style={{ width: 54, height: 60, flex: 'none', position: 'relative' }}><span className="abs" style={{ left: 0, top: 3 }}><Persona spec={flock(m.persona, m.color)} size={52} /></span></span>
              <b style={{ fontSize: 17, textAlign: 'left' }}>{m.label}</b>
            </button>
          )
        })}
      </div>
      <div className="grow" style={{ minHeight: 16 }} />
      <Btn kind="secondary" onClick={() => go('openings')}>Show me 3 openings</Btn>
    </Screen$>
  )
}
