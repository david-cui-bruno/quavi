import { StoreProvider, useStore, type Screen } from './store'
import { About, Customize, Interests, Login, Mood, Splash, Welcome } from './screens/onboarding'
import { Circle, Friend, Home, Openings, Writing } from './screens/home'
import { Complete, Details, Swap, Tell } from './screens/story'
import { Active } from './screens/active'
import { TrackingProvider } from './tracking'
import { Explore, RouteScreen, Stop } from './screens/explore'
import { Friends, Lists, Profile, Read, Shelf } from './screens/you'
import { useEffect, useRef, type ComponentType } from 'react'
import { OPENINGS, buildStory } from './data'

const SCREENS: Record<Screen, ComponentType> = {
  splash: Splash, welcome: Welcome, login: Login, interests: Interests, customize: Customize, mood: Mood,
  home: Home, openings: Openings, writing: Writing, details: Details, active: Active, swap: Swap, complete: Complete, tell: Tell,
  friend: Friend, explore: Explore, route: RouteScreen, stop: Stop, shelf: Shelf, profile: Profile, lists: Lists, read: Read, circle: Circle, about: About, friends: Friends,
}

const TITLES: Partial<Record<Screen, string>> = {
  splash: 'Welcome', welcome: 'Welcome', login: 'Log in', interests: 'Interests', customize: 'Your Quavi', mood: 'What happened?',
  home: 'Home', openings: 'Openings', writing: 'Writing', details: 'Detour', active: 'On your detour', swap: 'Swap a stop', complete: 'Detour complete',
  tell: 'Tell the story', friend: 'Friend’s story', explore: 'Explore', route: 'Route', stop: 'Stop', shelf: 'Story shelf', profile: 'You', lists: 'Your lists', read: 'Story', circle: 'Your circle', about: 'About you', friends: 'Friends',
}

function Shell() {
  const store = useStore()
  const { route, toast, toastOut, s } = store
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __q: unknown }).__q = { ...store, build: (i: number) => buildStory(OPENINGS[i]) }
  })
  const Cur = SCREENS[route.name]
  const phone = useRef<HTMLDivElement>(null)
  const first = useRef(true)
  // Route change: update the document title and move focus to the new screen so keyboard / screen-reader users aren't left on a removed node.
  useEffect(() => {
    document.title = `${TITLES[route.name] ?? 'Quavi'} · Quavi`
    if (first.current) { first.current = false; return }
    const main = phone.current?.querySelector<HTMLElement>('main')
    if (main) { main.setAttribute('tabindex', '-1'); main.focus({ preventScroll: true }) }
  }, [route.name, route.params, s.chapter])
  return (
    <div className="stage">
      <div className="phone" ref={phone}>
        {/* key forces the enter animation on every navigation */}
        <Cur key={`${route.name}-${JSON.stringify(route.params ?? {})}-${route.name === 'active' ? s.chapter : ''}`} />
        <div className="toast-region" role="status" aria-live="polite">{toast && <div className={`toast${toastOut ? ' out' : ''}`}>{toast}</div>}</div>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <TrackingProvider>
        <Shell />
      </TrackingProvider>
    </StoreProvider>
  )
}
