import {useSocial} from '../social'
import {SocialFriends,PrivateShare} from '../PrivateCircle'
import { SettingsSheet } from '../SettingsSheet'
import {Icon} from '../Icons'
import { Photo } from '../CloudPhoto'
import { useRef, useState } from 'react'
import { Persona, flock, safePair, safeSurface } from '../brand/Persona'
import { FRIEND_STORIES, SUGGESTED_FRIENDS, XP_PER_LEVEL, chapterImg, levelOf, chapterMeta, isPhotoTask, noteLines, notePrompt, photoLines, shareText, type Story } from '../data'
import { photoFiles, photoFromFile } from '../photo'
import { useStore } from '../store'
import { Arrow, BackBtn, BG, Btn, Chip, NoteQuote, RatingDucks, Screen$, type Bg } from '../ui'
import { GameHUD } from '../GameMap'
import { DemoRewards } from '../DemoRewards'

const SHELF_SURF: [Bg, string, 'Yellow' | 'Orange'][] = [
  ['yellow-p', 'Maple', 'Orange'], ['ink-p', 'Juno', 'Yellow'], ['soft', 'Pip', 'Orange'], ['orange-p', 'Luna', 'Yellow'],
]

export function Shelf() {
  const { s, go, account } = useStore()
  const social=useSocial()
  const [filter, setFilter] = useState<'All' | 'Loved it'>('All')
  const items = s.shelf.filter((x) => filter === 'All' || x.loved)
  const cols: Story[][] = [[], []]
  items.forEach((x, i) => cols[i % 2].push(x))
  return (
    <Screen$ tabs="you" scroll>
      <BackBtn onClick={() => go('profile')} />
      <div className="kicker" style={{ marginTop: 14 }}>Looking back</div>
      <h1 className="h1 h-l" style={{ margin: '4px 0 12px' }}>Your stories.</h1>
      <div className="chips" style={{ marginBottom: 14 }}>{(['All', 'Loved it'] as const).map((f) => <Chip key={f} on={filter === f} onClick={() => setFilter(f)}>{f}</Chip>)}</div>
      {items.length === 0 ? (
        <div className="col center" style={{ alignItems: 'center', gap: 12, marginTop: 24 }}>
          <div className="bounce"><Persona spec={flock('Luna', 'Orange')} size={130} /></div>
          <div className="h1 h-xs">Nothing on the shelf yet.</div>
          <p className="body muted" style={{ maxWidth: 240 }}>Finish a detour and tell the story. It’ll live here.</p>
          <Btn inline kind="primary" onClick={() => go('mood')}>Take a detour</Btn>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>
          {cols.map((col, ci) => (
            <div key={ci} className="col" style={{ gap: 12 }}>
              {col.map((x, k) => {
                const idx = (k * 2 + ci) % 4
                const [bg0, pn, pc] = SHELF_SURF[idx]
                const bg = safeSurface(flock(pn, pc), bg0 as 'paper') as Bg
                const tall = (k + ci) % 2 === 0
                const dark = bg === 'ink-p'
                const extra = x.rating ? 40 : 0
                return (
                  <button key={x.id} className="tile fade-in" onClick={() => go('read', { id: x.id })} style={{ background: BG[bg], height: (tall ? 226 : 176) + extra, color: dark ? 'var(--paper)' : 'var(--ink)', padding: 14 }}>
                    <div className="abs" style={{ left: '50%', top: tall ? 14 : 8, transform: 'translateX(-50%)' }}><Persona spec={flock(pn, pc)} size={tall ? 92 : 68} /></div>
                    <div className="h1" style={{ position: 'absolute', left: 18, right: 18, bottom: 40 + extra, fontSize: 17, lineHeight: 1.05, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{x.title}</div>
                    <div className="small" style={{ position: 'absolute', left: 18, right: 18, bottom: 18 + extra, fontWeight: 500 }}>{x.date} · {(account?social.data?.myPosts.some(p=>p.outingId===x.id):x.shared) ? 'Shared' : 'Not shared yet'}</div>
                    {x.rating && <div style={{ position: 'absolute', left: 14, bottom: 14 }}><RatingDucks rating={x.rating} size={12} compact /></div>}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </Screen$>
  )
}

export function Profile() {
  const { s, go, account } = useStore()
  const social=useSocial()
  const friendCount=account?social.data?.friends.length??0:s.friends.length
  const { user } = s
  const [settings, setSettings] = useState(false)
  const { stage: stageName, disc: discName } = safePair(user.avatar)
  const rows: [string, string, () => void][] = [
    ...(account ? [['Notifications', 'Updates from your circle', () => go('notifications')]] as [string,string,()=>void][] : []),
    ...(social.data?.canModerate ? [['Moderation', 'Review private reports', () => go('moderation')]] as [string,string,()=>void][] : []),
    ['Your lists', Object.keys(s.lists).join(' · '), () => go('lists')],
    ['Story shelf', 'Stories you’ve told', () => go('shelf')],
    ['Friends', friendCount ? `${friendCount} friend${friendCount > 1 ? 's' : ''}` : 'Add your first friend', () => go('friends')],
    ['Your interests', user.interests.length ? `${user.interests.length} picked` : 'Open to anything', () => go('interests')],
    ['Edit profile', `${user.name || 'Add your name'} · ${user.age21 ? '21+' : user.age21 === false ? 'Under 21' : 'Age'} · ${user.who ?? 'Solo'}`, () => go('about', { editing: true })],
  ]
  return (
    <Screen$ tabs="you" scroll>
      <div className="profile-heading"><h1 className="h1 h-s">Your duck tales.</h1><button className="back" aria-label="Settings" onClick={()=>setSettings(true)}><Icon name="settings"/></button></div>
      <div className="clip" style={{ background: BG[stageName as Bg], borderRadius: 36, height: 250, position: 'relative', flex: 'none' }}>
        <div className="abs" style={{ left: '50%', top: 36, width: 180, height: 180, marginLeft: -90, borderRadius: '50%', background: BG[discName as Bg] }} />
        <div className="abs bounce" style={{ left: '50%', top: 22, marginLeft: -78 }}><Persona spec={user.avatar} size={156} /></div>
        <span className="pill abs" style={{ left: 20, top: 20, background: 'var(--paper)' }}>{user.name} · you</span>
        <button className="btn primary abs" style={{ left: 90, right: 90, bottom: 14, width: 'auto', height: 46, fontSize: 14 }} onClick={() => go('customize', { editing: true })}>Edit your Quavi</button>
      </div>
      <div style={{ display: 'flex', margin: '12px 0', padding: '12px 0', borderTop: '1px solid rgba(30,27,22,.14)', borderBottom: '1px solid rgba(30,27,22,.14)' }}>
        {[[s.shelf.length, 'Told'], [Object.values(s.lists).reduce((a, l) => a + l.length, 0), 'Saved'], [friendCount, 'Friends']].map(([n, l], k) => (
          <div key={String(l)} style={{ flex: 1, paddingLeft: k ? 16 : 0, borderLeft: k ? '1px solid rgba(30,27,22,.14)' : 'none' }}>
            <div style={{ fontWeight: 700, fontSize: 26, letterSpacing: '-.01em', lineHeight: 1.1 }}>{n}</div>
            <div className="kicker" style={{ marginTop: 4 }}>{l}</div>
          </div>
        ))}
      </div>
      <div className="hud-inline"><GameHUD /></div>
      <div className="row" style={{ justifyContent: 'space-between', margin: '10px 4px 14px' }}>
        <span><b style={{ fontSize: 20, letterSpacing: '-.01em' }}>{s.game.xp.toLocaleString()} XP</b></span>
        <span className="small muted" style={{ fontWeight: 500 }}>{XP_PER_LEVEL - (s.game.xp % XP_PER_LEVEL)} XP to Level {levelOf(s.game.xp) + 1}</span>
      </div>
      <DemoRewards />
      <div className="card" style={{ borderRadius: 26, padding: 20, marginBottom: 10 }}>
        <div className="kicker">Badges</div>
        <div className="chips" style={{ marginTop: 8 }}>{s.game.badges.map((b) => <span key={b} className="pill" style={{ background: 'var(--yellow)' }}><Icon name="spark" size={14}/> {b}</span>)}</div>
      </div>
      <div className="col" style={{ gap: 8 }}>
        {rows.map(([t, m, fn]) => (
          <button key={t} className="card row" onClick={fn} style={{ borderRadius: 26, padding: 20, textAlign: 'left' }}>
            <div className="col" style={{ flex: 1 }}><b className="h1" style={{ fontSize: 18 }}>{t}</b><span className="small muted">{m}</span></div>
            <span style={{ fontSize: 22, color: 'var(--ink-p)' }}>›</span>
          </button>
        ))}
      </div>
      {settings && <SettingsSheet onClose={()=>setSettings(false)}/>}
    </Screen$>
  )
}

export function Lists() {
  const { s, go } = useStore()
  return (
    <Screen$ scroll>
      <BackBtn />
      <h1 className="h1 h-l" style={{ margin: '14px 0 14px' }}>Your lists.</h1>
      <div className="col" style={{ gap: 14 }}>
        {Object.entries(s.lists).map(([name, ids], i) => (
          <div key={name}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}><b className="h1" style={{ fontSize: 20 }}>{name}</b><span className="small muted">{ids.length}</span></div>
            {ids.length === 0 ? <div className="card small muted" style={{ borderRadius: 22, padding: 20 }}>Nothing here yet. Save a plan from its Save for later button.</div> : (
              <div className="col" style={{ gap: 8 }}>
                {ids.map((id) => {
                  const st = s.library[id] ?? FRIEND_STORIES.find((f) => f.id === id)
                  if (!st) return null
                  return (
                    <button key={id} className="card row" style={{ borderRadius: 24, padding: 14, textAlign: 'left', background: i % 2 ? 'var(--yellow-p)' : 'var(--orange-p)' }} onClick={() => go(FRIEND_STORIES.some((f) => f.id === id) ? 'friend' : 'read', { id })}>
                      <div style={{ width: 52, height: 62, position: 'relative', overflow: 'hidden', borderRadius: 18, background: 'var(--paper)' }}><div className="abs" style={{ left: 4, top: 8 }}><Persona spec={flock(['Pip', 'Juno', 'Maple'][i % 3], 'Orange')} size={44} /></div></div>
                      <div className="col" style={{ flex: 1 }}><b className="h1" style={{ fontSize: 16 }}>{st.title}</b><span className="small">{st.author ? `${st.author} · ` : ''}{st.chapters.length} chapters</span></div>
                      <Arrow size={20} />
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="grow" />
      <Btn kind="soft" onClick={() => go('shelf')} style={{ marginTop: 18 }}>Open story shelf</Btn>
    </Screen$>
  )
}

export function Read() {
  const { s, route, say, update, account } = useStore()
  const mine = s.shelf.find((x) => x.id === route.params?.id)
  const st = mine ?? s.library[String(route.params?.id)] ?? (account?undefined:FRIEND_STORIES[0])
  const [privateShare,setPrivateShare]=useState(false)
  const [draft, setDraft] = useState<Story | null>(null)
  if(!st)return <Screen$><BackBtn/><p>This story is unavailable. Open your circle to check current access.</p></Screen$>
  const caps = st.captions.length ? st.captions : st.chapters.map((c) => c.place)
  if (draft && mine) return <EditStory orig={mine} draft={draft} setDraft={setDraft} onSave={() => { update((x) => ({ ...x, shelf: x.shelf.map((y) => (y.id === draft.id ? draft : y)), story: x.story?.id === draft.id ? draft : x.story })); setDraft(null); say('Saved your changes') }} onCancel={() => setDraft(null)} />
  const share = async () => {
    const text = shareText(st, caps, st.author ?? (mine ? s.user.name || 'Me' : 'A friend'))
    try {
      const files = await photoFiles(st)
      if (navigator.share) await navigator.share(files.length && navigator.canShare?.({ files }) ? { title: st.title, text, files } : { title: st.title, text })
      else { await navigator.clipboard.writeText(text); say('Story copied') }
    } catch { /* cancelled */ }
  }
  return (
    <Screen$ scroll>
      <div className="row" style={{ justifyContent: 'space-between' }}><BackBtn />{mine && <button className="chip" onClick={() => setDraft({ ...mine, captions: caps, taskNotes: { ...(mine.taskNotes ?? {}) }, taskPhotos: { ...(mine.taskPhotos ?? {}) } })}>Edit</button>}</div>
      <div className="kicker" style={{ marginTop: 14 }}>{st.date} · {st.tone}</div>
      <h1 className="h1 h-l" style={{ margin: '6px 0 16px' }}>{st.title}</h1>
      <div className="col" style={{ gap: 16 }}>
        {st.chapters.map((c, i) => {
          const img = chapterImg(st, i)
          return (
            <div key={i} className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
              <div className="clip" style={{ width: 84, height: 96, borderRadius: 24, background: `var(--${safeSurface(flock(c.persona, i === 0 ? 'Orange' : 'Yellow'), (['yellow-p', 'orange-p', 'ink-p'] as const)[i % 3])})`, position: 'relative', flex: 'none' }}>
                {img ? <Photo src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div className="abs" style={{ left: 16, top: 10 }}><Persona spec={flock(c.persona, i === 0 ? 'Orange' : 'Yellow')} size={60} /></div>}
              </div>
              <div className="col" style={{ flex: 1, gap: 3 }}><span className="kicker">Chapter {i + 1} · {c.place}</span><span className="h1" style={{ fontSize: 19, lineHeight: 1.1 }}>{caps[i]}</span>{photoLines(st).filter((p) => p.chapter === i).map((p) => <Photo key={p.task} src={p.img} alt={`Photo: ${p.task}`} style={{ width: '100%', height: 170, objectFit: 'cover', borderRadius: 20, marginTop: 8 }} />)}{noteLines(st).filter((n) => n.chapter === i).map((n) => <NoteQuote key={n.task} task={n.task} note={n.note} style={{ marginTop: 8 }} />)}</div>
            </div>
          )
        })}
      </div>
      <div className="grow" style={{ minHeight: 20 }} />
      {account&&mine&&<Btn onClick={()=>setPrivateShare(true)}>Share with friends</Btn>}
      <Btn kind={account?"soft":"primary"} onClick={share}>{account?"Export a copy":"Share this story"}</Btn>
      {privateShare&&<PrivateShare story={st} onClose={()=>setPrivateShare(false)}/>}
    </Screen$>
  )
}

/** Change what you wrote later: the title, how each chapter is told, and your words and photos from the tasks. */
function EditStory({ orig, draft, setDraft, onSave, onCancel }: { orig: Story; draft: Story; setDraft: (s: Story) => void; onSave: () => void; onCancel: () => void }) {
  const { s } = useStore()
  const photoKey = useRef('')
  const fileInput = useRef<HTMLInputElement>(null)
  const setNote = (k: string, v: string) => setDraft({ ...draft, taskNotes: { ...(draft.taskNotes ?? {}), [k]: v } })
  const setCap = (i: number, v: string) => setDraft({ ...draft, captions: draft.chapters.map((_, k) => (k === i ? v : draft.captions[k] ?? draft.chapters[k].place)) })
  const dirty = JSON.stringify([draft.title, draft.captions, draft.taskNotes, draft.taskPhotos]) !== JSON.stringify([orig.title, orig.captions.length ? orig.captions : draft.captions, orig.taskNotes ?? {}, orig.taskPhotos ?? {}])
  const pick = async (f?: File) => {
    if (!f || !photoKey.current) return
    const img = await photoFromFile(f)
    setDraft({ ...draft, taskPhotos: { ...(draft.taskPhotos ?? {}), [photoKey.current]: img } })
  }
  const removePhoto = (k: string) => { const next = { ...(draft.taskPhotos ?? {}) }; delete next[k]; setDraft({ ...draft, taskPhotos: next }) }
  return (
    <Screen$ scroll>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button className="chip" onClick={onCancel}>Cancel</button>
        <span className="kicker">Editing</span>
      </div>
      <h1 className="h1 h-m" style={{ margin: '14px 0 12px' }}>Say what you meant.</h1>
      <div className="field" style={{ height: 'auto', padding: '14px 24px', borderRadius: 24, marginBottom: 16 }}>
        <label htmlFor="ed-title">TITLE</label>
        <input id="ed-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
      </div>
      <div className="col" style={{ gap: 18 }}>
        {draft.chapters.map((c, i) => {
          const meta = chapterMeta(draft, i)
          const done = s.game.done[`${draft.id}:${i}`] ?? []
          const tasks = meta.tasks.filter((t) => draft.taskNotes?.[`${i}:${t.id}`] !== undefined || draft.taskPhotos?.[`${i}:${t.id}`] || done.includes(t.id))
          return (
            <div key={i}>
              <div className="kicker">Chapter {i + 1} · {c.place}</div>
              <div className="field" style={{ height: 'auto', padding: '14px 24px', borderRadius: 24, margin: '6px 0 10px' }}>
                <label htmlFor={`ed-cap-${i}`}>HOW YOU’D TELL IT</label>
                <textarea maxLength={4000} id={`ed-cap-${i}`} rows={2} value={draft.captions[i] ?? c.place} onChange={(e) => setCap(i, e.target.value)} style={{ width: '100%', fontWeight: 500, fontSize: 15, resize: 'none' }} />
              </div>
              {tasks.map((t) => {
                const k = `${i}:${t.id}`
                const img = draft.taskPhotos?.[k]
                return (
                  <div key={t.id} className="card" style={{ background: 'var(--soft)', padding: '14px 24px', borderRadius: 24, marginBottom: 10 }}>
                    <b style={{ fontSize: 14 }}>{t.text}</b>
                    {isPhotoTask(t) && (
                      <div style={{ margin: '10px 0' }}>
                        {img
                          ? <div style={{ position: 'relative' }}>
                              <Photo src={img} alt={`Photo: ${t.text}`} style={{ width: '100%', height: 150, objectFit: 'cover', borderRadius: 16, display: 'block' }} />
                              <div className="row" style={{ position: 'absolute', right: 8, bottom: 8, gap: 6 }}>
                                <button className="pill" style={{ background: 'var(--paper)' }} onClick={() => { photoKey.current = k; fileInput.current?.click() }}>Replace</button>
                                <button className="pill" style={{ background: 'var(--paper)' }} onClick={() => removePhoto(k)}>Remove</button>
                              </div>
                            </div>
                          : <button className="pill" style={{ background: 'var(--paper)' }} onClick={() => { photoKey.current = k; fileInput.current?.click() }}>＋ Add a photo</button>}
                      </div>
                    )}
                    <textarea maxLength={4000} aria-label={`Your words for ${t.text}`} rows={2} value={draft.taskNotes?.[k] ?? ''} placeholder={isPhotoTask(t) ? 'What’s the story behind this photo?' : notePrompt(t)} onChange={(e) => setNote(k, e.target.value)}
                      style={{ width: '100%', marginTop: 10, fontSize: 14, lineHeight: 1.4, background: 'var(--paper)', borderRadius: 16, padding: '12px 14px', resize: 'none' }} />
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }} />
      <div className="grow" style={{ minHeight: 18 }} />
      <div className="col" style={{ gap: 10 }}>
        <Btn onClick={onSave} disabled={!dirty}>Save changes</Btn>
      </div>
    </Screen$>
  )
}

const FRIEND_DUCKS = ['Zed', 'Maple', 'Juno', 'Rex', 'Coco', 'Luna', 'Poppy', 'Dax']
const duckOf = (name: string) => FRIEND_DUCKS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % FRIEND_DUCKS.length]
export const storiesBy = (name: string) => FRIEND_STORIES.filter((f) => f.author?.toLowerCase() === name.toLowerCase())

/** Who's in your circle: see them, add people, remove people. */
export function Friends() {
  const { s, update, go, say, account } = useStore()
  const [name, setName] = useState('')
  if(account)return <SocialFriends/>
  const has = (n: string) => s.friends.some((f) => f.name.toLowerCase() === n.trim().toLowerCase())
  const add = (n: string) => {
    const t = n.trim()
    if (!t) return
    if (has(t)) { say(`${t} is already in your circle`); return }
    update((st) => ({ ...st, friends: [...st.friends, { id: `f-${Date.now()}-${t}`, name: t }] }))
    say(`Added ${t}`)
    setName('')
  }
  const remove = (id: string, n: string) => { update((st) => ({ ...st, friends: st.friends.filter((f) => f.id !== id) })); say(`Removed ${n}`) }
  const suggestions = SUGGESTED_FRIENDS.filter((n) => !has(n))
  return (
    <Screen$ tabs="you" scroll>
      <BackBtn onClick={() => go('profile')} />
      <div className="kicker" style={{ marginTop: 14 }}>Your circle</div>
      <h1 className="h1 h-l" style={{ margin: '4px 0 14px' }}>Friends.</h1>
      <form onSubmit={(e) => { e.preventDefault(); add(name) }} className="row" style={{ gap: 10, marginBottom: 18 }}>
        <div className="field" style={{ flex: 1, minWidth: 0 }}>
          <label htmlFor="fr-add">ADD A FRIEND</label>
          <input id="fr-add" value={name} onChange={(e) => setName(e.target.value)} placeholder="Their name" maxLength={24} />
        </div>
        <button type="submit" className="btn primary sm" style={{ flex: 'none', height: 62, borderRadius: 31 }} disabled={!name.trim()}>Add</button>
      </form>
      {s.friends.length === 0 ? (
        <div className="card" style={{ background: 'var(--soft)', padding: '20px 24px', borderRadius: 24, marginBottom: 18 }}>
          <b className="h1" style={{ fontSize: 19 }}>No friends yet.</b>
          <p className="body muted" style={{ marginTop: 4 }}>Add people to see their stories and what they’ve been up to.</p>
        </div>
      ) : (
        <div className="col" style={{ gap: 10, marginBottom: 18 }}>
          {s.friends.map((f) => {
            const stories = storiesBy(f.name)
            return (
              <div key={f.id} className="card row" style={{ padding: '12px 14px 12px 12px', borderRadius: 24, gap: 12 }}>
                <button className="row" style={{ flex: 1, minWidth: 0, gap: 12, textAlign: 'left' }} disabled={!stories.length} onClick={() => stories[0] && go('friend', { id: stories[0].id })} aria-label={stories.length ? `Open ${f.name}’s latest story` : f.name}>
                  <div style={{ width: 52, height: 52, borderRadius: 26, background: 'var(--yellow-p)', overflow: 'hidden', position: 'relative', flex: 'none' }}>
                    <div style={{ position: 'absolute', left: 4, top: 7 }}><Persona spec={flock(duckOf(f.name), 'Orange')} size={44} /></div>
                  </div>
                  <div className="col" style={{ minWidth: 0 }}>
                    <b style={{ fontSize: 16 }}>{f.name}</b>
                    <span className="small muted">{stories.length ? `${stories.length} ${stories.length > 1 ? 'stories' : 'story'} · ${stories[0].date}` : 'No stories yet'}</span>
                  </div>
                </button>
                <button className="small muted" style={{ fontWeight: 700 }} onClick={() => remove(f.id, f.name)} aria-label={`Remove ${f.name}`}>Remove</button>
              </div>
            )
          })}
        </div>
      )}
      {suggestions.length > 0 && (
        <>
          <div className="kicker" style={{ marginBottom: 8 }}>People you may know</div>
          <div className="chips" style={{ marginBottom: 12 }}>
            {suggestions.map((n) => <Chip key={n} onClick={() => add(n)}>＋ {n}</Chip>)}
          </div>
        </>
      )}
    </Screen$>
  )
}
