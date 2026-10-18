import {groundedCaptions} from './captions.mjs'
import {PLACE_META,categoryTasks,adaptTasks,TRIP_XP_CAP} from '../server/src/reward-rules'
import type { AvatarSpec, Colorway } from './brand/Persona'
import { distance } from './geo'

export type Alt = { place: string; meta: string; persona: string; color: Colorway; ll?: { lat: number; lng: number }; kind?: string }
export type HoursCheck = {venueStatus?:'matched'|'unverified'|'unsuitable';venueIssue?:'category_mismatch'|'service_area';websiteURL?:string;status:'open'|'closed'|'unknown';checkedAt:string;arrivalAt:string;leaveAt:string;googlePlaceId?:string;mapsURL?:string;attributions:{displayName:string;uri?:string}[]}
export type Chapter = {
  aliases?:string[]
  googlePlaceId?:string
  googleRoute?:boolean
  hours?:HoursCheck
  title: string
  place: string
  meta: string
  mins: number
  desc: string
  walk: string
  persona: string
  color: Colorway
  alts: Alt[]
  /** map position (0-100) */
  at: [number, number]
  /** real-world position, for stops found on the map */
  ll?: { lat: number; lng: number }
  /** what kind of place it is (café, park…), used to pick sidequests */
  kind?: string
}
export type WalkingCheck = {warnings?:string[]; legs: {distance:number;duration:number}[]; distance:number; duration:number; checkedAt:string; provider:string }
export type PlaceSource = { provider: string; updatedAt: string; attributionURL: string }

export type Opening = {
  origin?: {lat:number;lng:number}
  source?: PlaceSource
  estimatedMinutes?: number
  walking?: WalkingCheck
  timeBudgetMinutes?: number
  id: string
  title: string
  tags: string
  route: string
  premise: string
  bg: 'paper' | 'orange' | 'ink'
  persona: string
  color: Colorway
  chapters: Chapter[]
}

export const INTERESTS = [
  { id: 'food', label: 'Food finds', bg: 'yellow', persona: 'Biscuit', color: 'Orange' },
  { id: 'cozy', label: 'Cozy corners', bg: 'orange', persona: 'Zed', color: 'Yellow' },
  { id: 'art', label: 'Art & culture', bg: 'ink', persona: 'Maple', color: 'Yellow' },
  { id: 'air', label: 'Fresh air', bg: 'soft', persona: 'Pip', color: 'Orange' },
  { id: 'fun', label: 'Fun & games', bg: 'orange', persona: 'Prof. Quill', color: 'Yellow' },
  { id: 'gems', label: 'Hidden gems', bg: 'yellow', persona: 'Curly', color: 'Orange' },
] as const

/** Each interest gets a bird dressed for it, built from the Persona Kit parts. */
export const INTEREST_SPEC: Record<string, AvatarSpec> = {
  food: { color: 'Orange', headwear: 'Headwear/Chef Hat', face: ['Face/Handlebar'], neckwear: 'Neckwear/Bandana' },
  cozy: { color: 'Yellow', headwear: 'Headwear/Beanie', face: ['Face/Sleepy'], neckwear: 'Neckwear/Scarf' },
  art: { color: 'Yellow', headwear: 'Headwear/Beret', eyewear: 'Eyewear/Round', face: ['Face/Handlebar'] },
  air: { color: 'Orange', headwear: 'Headwear/Cap', face: ['Face/Freckles'], neckwear: 'Neckwear/Backpack' },
  fun: { color: 'Yellow', headwear: 'Headwear/Headphones', eyewear: 'Eyewear/Shades' },
  gems: { color: 'Orange', headwear: 'Headwear/Top Hat', eyewear: 'Eyewear/Monocle', face: ['Face/Wink'] },
}

export const MOODS = [
  { id: 'bailed', label: 'Friend bailed', persona: 'Luna', color: 'Yellow' },
  { id: 'closed', label: 'Place closed', persona: 'Juno', color: 'Ink' },
  { id: 'mood', label: 'Mood changed', persona: 'Curly', color: 'Yellow' },
  { id: 'weather', label: 'Weather', persona: 'Prof. Quill', color: 'Ink' },
  { id: 'late', label: 'Running late', persona: 'Nana Bea', color: 'Yellow' },
] as const

export const OPENINGS: Opening[] = [
  {
    id: 'cozy',
    title: 'The cozy night',
    tags: 'Warm · low effort · ~1 hr',
    route: 'Coffee → Bookshop → Walk home',
    premise: 'A cozy start, a lucky find, and a slow walk home.',
    bg: 'paper',
    persona: 'Luna',
    color: 'Orange',
    chapters: [
      {
        title: 'A coffee worth the walk',
        place: 'Corner Coffee',
        meta: 'Corner Coffee · 15–20 min',
        mins: 20,
        desc: 'A cozy neighborhood café. Try a drink that sounds good.',
        walk: '6 min walk',
        persona: 'Pip',
        color: 'Yellow',
        at: [24, 74],
        alts: [
          { place: 'A quieter coffee corner', meta: '4 min away · $5–10', persona: 'Maple', color: 'Ink' },
          { place: 'A little garden break', meta: '3 min away · Free', persona: 'Pip', color: 'Orange' },
          { place: 'Something sweet instead', meta: '6 min away · $5–12', persona: 'Biscuit', color: 'Orange' },
        ],
      },
      {
        title: 'Lost in a bookshop',
        place: 'Paper & Pine',
        meta: 'Paper & Pine · 20 min',
        mins: 20,
        desc: 'Wander the shelves until something picks you.',
        walk: '4 min walk',
        persona: 'Luna',
        color: 'Yellow',
        at: [50, 52],
        alts: [
          { place: 'A tiny record shop', meta: '5 min away · Free', persona: 'Dax', color: 'Yellow' },
          { place: 'A plant shop', meta: '3 min away · Free', persona: 'Pip', color: 'Orange' },
          { place: 'A stationery nook', meta: '6 min away · $', persona: 'Maple', color: 'Orange' },
        ],
      },
      {
        title: 'Take the scenic way',
        place: 'Abingdon Square',
        meta: 'Abingdon Square · 15 min',
        mins: 15,
        desc: 'Walk home through the park while the lights come on.',
        walk: '7 min walk',
        persona: 'Maple',
        color: 'Yellow',
        at: [78, 30],
        alts: [
          { place: 'The river path', meta: '9 min away · Free', persona: 'Luna', color: 'Orange' },
          { place: 'Rooftop bench', meta: '6 min away · Free', persona: 'Zed', color: 'Yellow' },
          { place: 'The long block', meta: '2 min away · Free', persona: 'Pip', color: 'Orange' },
        ],
      },
    ],
  },
  {
    id: 'lucky',
    title: 'The lucky find',
    tags: 'Curious · a little new · ~90 min',
    route: 'Gallery → Wine bar → Garden',
    premise: 'Something new, something small, and a garden to finish.',
    bg: 'orange',
    persona: 'Juno',
    color: 'Yellow',
    chapters: [
      { title: 'Walk into the gallery', place: 'Little Gallery', meta: 'Little Gallery · 25 min', mins: 25, desc: 'Pick one piece and decide what it’s about.', walk: '8 min walk', persona: 'Juno', color: 'Orange', at: [24, 74], alts: [
        { place: 'A window gallery', meta: '3 min away · Free', persona: 'Juno', color: 'Yellow' },
        { place: 'A zine shop', meta: '5 min away · $', persona: 'Dax', color: 'Orange' },
        { place: 'A mural alley', meta: '6 min away · Free', persona: 'Zed', color: 'Yellow' } ] },
      { title: 'One glass, no rush', place: 'The Low Door', meta: 'The Low Door · 35 min', mins: 35, desc: 'A wine bar with exactly four stools.', walk: '5 min walk', persona: 'Prof. Quill', color: 'Yellow', at: [50, 52], alts: [
        { place: 'A tea bar', meta: '4 min away · $8', persona: 'Nana Bea', color: 'Orange' },
        { place: 'Natural wine counter', meta: '6 min away · $$', persona: 'Rex', color: 'Yellow' },
        { place: 'A juice window', meta: '2 min away · $', persona: 'Pip', color: 'Orange' } ] },
      { title: 'Finish in a garden', place: 'Elm Street Garden', meta: 'Elm Street Garden · 20 min', mins: 20, desc: 'A hidden courtyard that stays open late.', walk: '6 min walk', persona: 'Pip', color: 'Orange', at: [78, 30], alts: [
        { place: 'The pocket park', meta: '3 min away · Free', persona: 'Maple', color: 'Orange' },
        { place: 'A quiet stoop', meta: '2 min away · Free', persona: 'Luna', color: 'Yellow' },
        { place: 'The pier', meta: '12 min away · Free', persona: 'Zed', color: 'Orange' } ] },
    ],
  },
  {
    id: 'bold',
    title: 'The bold one',
    tags: 'Social · out loud · ~2 hrs',
    route: 'Arcade → Late bite → Rooftop',
    premise: 'Loud, snacky, and ending with a view.',
    bg: 'ink',
    persona: 'Rex',
    color: 'Yellow',
    chapters: [
      { title: 'Play something dumb', place: 'Pixel Palace', meta: 'Pixel Palace · 40 min', mins: 40, desc: 'Ten quarters, one rule: high score buys the snacks.', walk: '9 min walk', persona: 'Rex', color: 'Orange', at: [24, 74], alts: [
        { place: 'Bowling alley', meta: '8 min away · $$', persona: 'Dax', color: 'Yellow' },
        { place: 'Pinball bar', meta: '6 min away · $$', persona: 'Zed', color: 'Orange' },
        { place: 'Karaoke room', meta: '10 min away · $$', persona: 'Coco', color: 'Orange' } ] },
      { title: 'A very late bite', place: 'Dumpling Window', meta: 'Dumpling Window · 25 min', mins: 25, desc: 'Order one more than you think you should.', walk: '4 min walk', persona: 'Biscuit', color: 'Yellow', at: [50, 52], alts: [
        { place: 'Slice counter', meta: '2 min away · $', persona: 'Pip', color: 'Orange' },
        { place: 'Taco cart', meta: '5 min away · $', persona: 'Rex', color: 'Yellow' },
        { place: 'Night bakery', meta: '7 min away · $', persona: 'Biscuit', color: 'Orange' } ] },
      { title: 'End on the rooftop', place: 'Roof 44', meta: 'Roof 44 · 30 min', mins: 30, desc: 'The city, small and glowing. Say the thing.', walk: '11 min walk', persona: 'Sir Waddles', color: 'Yellow', at: [78, 30], alts: [
        { place: 'The pier edge', meta: '12 min away · Free', persona: 'Luna', color: 'Orange' },
        { place: 'Parking-garage view', meta: '4 min away · Free', persona: 'Zed', color: 'Yellow' },
        { place: 'Bridge walkway', meta: '9 min away · Free', persona: 'Pip', color: 'Orange' } ] },
    ],
  },
]

export type Story = {
  /** Online-only, authorized circle view. Never imported into the private outing journal. */
  sharedNotes?: NoteLine[]
  sharedPhotos?: PhotoLine[]
  origin?: {lat:number;lng:number}
  source?: PlaceSource
  estimatedMinutes?: number
  walking?: WalkingCheck
  timeBudgetMinutes?: number
  id: string
  title: string
  openingId: string
  premise: string
  chapters: Chapter[]
  moments: Record<number, { note?: string; feeling?: string }>
  tone: 'Cozy' | 'Funny' | 'Dramatic'
  captions: string[]
  date: string
  loved?: boolean
  rating?: 1 | 2 | 3 | 4 | 5
  /** the "Adjust the plan" choices this story was built with */
  prefs?: Prefs
  /** 'active' once you tap Start, 'done' when you reach the end or end it early */
  outingPhase?: 'planned' | 'active' | 'paused' | 'completed' | 'abandoned'
  arrivedStops?: number[]
  status?: 'active' | 'done'
  author?: string
  /** the user's own words about what happened on a task, keyed `${chapter}:${taskId}` */
  taskNotes?: Record<string, string>
  /** photos taken for photo tasks (data URLs), keyed `${chapter}:${taskId}` */
  taskPhotos?: Record<string, string>
  /** optional message to friends that opens the shared post */
  intro?: string
  shared?: boolean
}

export const TITLES: Record<string, string> = {
  cozy: 'The little escape',
  lucky: 'The lucky find',
  bold: 'The loud one',
}

export function buildStory(o: Opening): Story {
  return {
    id: crypto.randomUUID(),
    title: TITLES[o.id] ?? o.title,
    openingId: o.id,
    origin: o.origin, source: o.source, estimatedMinutes: o.estimatedMinutes, walking:o.walking, timeBudgetMinutes:o.timeBudgetMinutes,
    premise: o.premise,
    chapters: o.chapters.map((c) => ({ ...c })),
    moments: {},
    tone: 'Cozy',
    captions: [],
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }
}

/** A new story built for this person: their usual company, and no drink spots if they're under 21. */
export function startStory(o: Opening, user: { who?: string; age21?: boolean }): Story {
  return applyPrefs(buildStory(o), { ...DEFAULT_PREFS, who: user.who ?? 'Solo', dry: user.age21 === false })
}

const TEMPLATES: Record<Story['tone'], ((c: Chapter, i: number, n: number) => string)[]> = {
  Cozy: [
    (c) => `Plans fell through. ${c.place} did not.`,
    (c) => `Lost an hour at ${c.place} on purpose.`,
    (c) => `Walked home by way of ${c.place}, slowly.`,
  ],
  Funny: [
    (c) => `Got stood up, got ${c.place}. Net win.`,
    (c) => `${c.place} had opinions. So did I.`,
    (c) => `Ended at ${c.place}. Zero regrets, some questions.`,
  ],
  Dramatic: [
    (c) => `The night was supposed to end. Then, ${c.place}.`,
    (c) => `At ${c.place}, everything changed.`,
    (c) => `And so, ${c.place}. The final scene.`,
  ],
}

export function draftCaptions(s: Story, tone: Story['tone']): string[] {
  if(s.source||s.chapters.some(c=>c.ll))return groundedCaptions(s,noteLines(s),tone)
  return s.chapters.map((c, i) => {
    const m = s.moments[i]
    if (m?.note) return m.note
    const t = TEMPLATES[tone]
    return t[Math.min(i, t.length - 1)](c, i, s.chapters.length)
  })
}

/** People you can add in the demo. Their stories show up in your circle once you add them. */
export const SUGGESTED_FRIENDS = ['Maya', 'Jess', 'Sam', 'Alex', 'Priya']

export const FRIEND_STORIES: Story[] = [
  {
    id: 'maya-1',
    title: 'Coffee. Books. A breath of fresh air.',
    openingId: 'cozy',
    premise: 'A cozy start, a lucky find, and a slow walk home.',
    chapters: OPENINGS[0].chapters,
    moments: {},
    tone: 'Cozy',
    captions: ['Plans fell through. The coffee did not.', 'Lost an hour at Paper & Pine on purpose.', 'Walked home the scenic way.'],
    taskNotes: {
      '0:order': 'Cardamom bun. Dangerous. I will be back.',
      '0:barista': 'Dev behind the counter told me he’s saving up for a tiny bakery of his own. I tipped extra.',
      '1:cover': 'Picked a green book with a fox on it. It was about grief and also very funny somehow.',
    },
    date: '2 hours ago',
    author: 'Maya',
  },
  {
    id: 'jess-1',
    title: 'The night John told me everything',
    openingId: 'lucky',
    premise: 'Something new, something small, and a garden to finish.',
    chapters: OPENINGS[1].chapters,
    moments: {},
    tone: 'Funny',
    captions: ['A gallery, a decision, a title change.', 'Toasted a cancelled plan and got a life story back.', 'Garden. Quiet. Needed it.'],
    taskNotes: {
      '1:toast': 'Toasted the plan that fell through with the guy on the next stool. His name is John. He used to be an actor: one season on a soap in the 90s. He died on screen in episode 4 and did the whole death scene for me, right there at the bar.',
      '1:stool': 'Got the stool by the window. John took the one next to it ten minutes later and ruined my evening in the best way.',
      '0:title': 'Renamed the painting “Dad’s Garage, Sunday”. The gallery guy laughed.',
    },
    date: 'Last night',
    author: 'Jess',
  },
  {
    id: 'sam-1',
    title: 'The rooftop that saved Friday',
    openingId: 'bold',
    premise: 'Loud, snacky, and ending with a view.',
    chapters: OPENINGS[2].chapters,
    moments: {},
    tone: 'Funny',
    captions: ['Lost at pinball, won at dumplings.', 'One more than I should have ordered.', 'The city looked small. So did my problems.'],
    date: 'Yesterday',
    author: 'Sam',
  },
]

export const MAP_PLACES = [
  { name: 'Corner Coffee', at: [22, 46], persona: 'Pip', color: 'Orange' },
  { name: 'Paper & Pine', at: [52, 36], persona: 'Juno', color: 'Orange' },
  { name: 'Little Gallery', at: [82, 28], persona: 'Zed', color: 'Orange' },
  { name: 'Garden Nook', at: [70, 48], persona: 'Maple', color: 'Orange' },
] as const

export const DEFAULT_LISTS = ['Want to try', 'Favorites', 'Date ideas']

// ---------------------------------------------------------------------------
// Arrival tasks + coordinates (West Village, NYC). Tasks unlock when the user
// reaches a stop (geofence) so each place comes with a little context.
// ---------------------------------------------------------------------------
export type Task = { id: string; text: string; xp: number; hint: string }
export type PlaceMeta = { lat: number; lng: number; badge: string; tasks: Task[] }

export {PLACE_META,categoryTasks} from '../server/src/reward-rules'


/** Plain-language "what is this place?" shown before you commit to walking there. */
const PLACE_INFO: Record<string, { kind: string; about: string }> = {
  'Corner Coffee': { kind: 'Neighborhood café', about: 'A small, friendly coffee shop with a short menu and fresh pastries. Easy to sit with a drink for twenty minutes.' },
  'Paper & Pine': { kind: 'Independent bookshop', about: 'A cozy used and new bookstore with warm lighting and plenty of corners to browse. No need to buy anything.' },
  'Abingdon Square': { kind: 'Small park', about: 'A little public square with benches, trees and a lot of dog-walkers. Free, open and good for a slow breather.' },
  'Little Gallery': { kind: 'Free art gallery', about: 'Two small rooms of local art you can walk through in about ten minutes. Free to enter.' },
  'The Low Door': { kind: 'Wine bar', about: 'A tiny bar with four stools, a short list of natural wines and low lighting. Friendly if you want to ask for a pick.' },
  'Elm Street Garden': { kind: 'Hidden courtyard garden', about: 'A quiet pocket garden tucked behind a gate, with benches and plants. Most people walk right past it.' },
  'Pixel Palace': { kind: 'Arcade', about: 'A bright, noisy arcade with classic cabinets and pinball. Games cost quarters, so bring a few.' },
  'Dumpling Window': { kind: 'Walk-up dumpling spot', about: 'A street-side window that sells dumplings by the dozen. You eat standing up, and it’s cheap and fast.' },
  'Roof 44': { kind: 'Rooftop lounge', about: 'A rooftop bar-lounge with open views over the neighborhood skyline. It’s best around sunset and is usually calm and a little dressy.' },
  'Garden Nook': { kind: 'Hidden courtyard', about: 'A tiny courtyard with a bench and a few plants, tucked off the street. Free, quiet and most people walk right past it.' },
  'Karaoke room': { kind: 'Private karaoke room', about: 'A room you rent by the hour to sing with friends, or alone. No stage fright required, as nobody else is watching.' },
  'Bowling alley': { kind: 'Bowling alley', about: 'A casual alley with shoe rental and a snack bar. Good for a loud, silly game.' },
  'Pinball bar': { kind: 'Bar with pinball', about: 'A relaxed bar with rows of pinball machines to play while you drink.' },
  'Night bakery': { kind: 'Late-night bakery', about: 'A bakery that stays open late for warm bread and pastries after the cafés close.' },
  'Slice counter': { kind: 'Pizza by the slice', about: 'A counter that sells big, cheap slices. You’ll be in and out in ten minutes.' },
  'Taco cart': { kind: 'Street food cart', about: 'A street cart serving tacos made to order. It’s cash-friendly and quick.' },
  'Natural wine counter': { kind: 'Wine counter', about: 'A small shop-bar pouring natural wine by the glass, with staff who like to recommend something.' },
  'The pier': { kind: 'Riverside pier', about: 'A wide walkway that stretches out over the water, with benches and open sky. Free and breezy.' },
  'The pier edge': { kind: 'Riverside lookout', about: 'The far end of the pier, with the best view of the water and the skyline. Free and a little windy.' },
  'The river path': { kind: 'Waterfront path', about: 'A flat, easy path along the river for walkers and runners. Free and pretty at golden hour.' },
  'Rooftop bench': { kind: 'Quiet viewpoint', about: 'A public bench with a high view over the rooftops. Free, calm and good for a pause.' },
  'Bridge walkway': { kind: 'Pedestrian bridge', about: 'A footbridge over the road with a clear view of the city lights. Free, short and open day and night.' },
  'Parking-garage view': { kind: 'Secret city view', about: 'The top level of a parking garage that happens to have a great skyline view. Free, and surprisingly peaceful.' },
  'The long block': { kind: 'Neighborhood walk', about: 'An unhurried stroll along a long, tree-lined block with nothing planned. It’s about noticing details.' },
  'The pocket park': { kind: 'Tiny park', about: 'A small hidden park with a few benches and some green. Free, quiet and easy to miss.' },
  'A quiet stoop': { kind: 'Neighborhood stoop', about: 'A calm set of front steps where you can sit and watch the block go by. Free and a nice place to be still.' },
}

export function placeInfo(place: string, desc?: string): { kind: string; about: string } {
  const known = PLACE_INFO[place]
  if (known) return known
  const p = place.toLowerCase()
  const kind = /coffee|café|cafe|tea/.test(p) ? 'Café' : /juice|sweet|bakery/.test(p) ? 'Sweet stop' : /book|record|plant|stationery|zine/.test(p) ? 'Small shop' : /gallery|mural/.test(p) ? 'Art stop' : /garden|park|stoop/.test(p) ? 'Quiet green spot' : 'Local stop'
  return { kind, about: desc ?? 'A local spot picked for tonight’s route.' }
}



/** Coordinates + tasks for chapter `i` of a story (handles swapped stops). */
export function chapterMeta(s: Story, i: number): PlaceMeta {
  const m = baseMeta(s, i)
  return { ...m, tasks: adaptTasks(m.tasks, s.prefs) }
}

function baseMeta(s: Story, i: number): PlaceMeta {
  const c = s.chapters[i]
  if (c.ll) return { lat: c.ll.lat, lng: c.ll.lng, badge: c.place.split(' ').slice(-1)[0] + ' Fan', tasks: categoryTasks(`${c.place} ${c.kind ?? ''}`) }
  const known = PLACE_META[c.place]
  if (known) return known
  const base = OPENINGS.find((o) => o.id === s.openingId)?.chapters[i]
  const b = (base && PLACE_META[base.place]) ?? Object.values(PLACE_META)[0]
  const h = [...c.place].reduce((a, ch) => a + ch.charCodeAt(0), 0)
  return {
    lat: b.lat + (((h % 7) - 3) * 0.00022),
    lng: b.lng + ((((h >> 3) % 7) - 3) * 0.00022),
    badge: c.place.split(' ').slice(-1)[0] + ' Fan',
    tasks: categoryTasks(c.place),
  }
}

/** Straight-line metres from where you start through every stop. */
export function tripMeters(s: Story): number {
  let prev = s.origin ?? { lat: 40.7329, lng: -74.0031 }
  return s.chapters.reduce((sum, _c, i) => { const m = chapterMeta(s, i); const d = distance(prev, { lat: m.lat, lng: m.lng }); prev = { lat: m.lat, lng: m.lng }; return sum + d }, 0)
}

// ---- "Adjust the plan": spend, who's coming and how you get around change the stops and the tasks ----
export type Prefs = { time: string; spend: string; who: string; move: string; /** under 21: leave out bars, pubs and wine spots */ dry?: boolean }
export const DEFAULT_PREFS: Prefs = { time: '60 min', spend: 'Free', who: 'Solo', move: 'Walking' }
/** Spots built around alcohol, left out for anyone under 21. */
export const isDrinkPlace = (text: string) => /wine|\bpubs?\b|cocktail|lounge|speakeasy|brewer|low door|listening bar|(?<!tea |coffee |juice |milk )\bbars?\b/i.test(text)
const DRY_COPY: Record<string, { kind: string; about: string }> = {
  'The Record Room': { kind: 'Listening room', about: 'A dim room with a wall of vinyl and a good sound system. Pick a record and stay for something warm.' },
  'Roof 44': { kind: 'Rooftop terrace', about: 'A rooftop terrace with open views over the skyline. Come for the view and order something warm.' },
}
const isTreat = (p: Prefs) => p.spend === '$$ Treat myself'
const isLow = (p: Prefs) => p.spend === '$ Low'

/** Sidequests that fit what you asked for: spending more, spending little, or being with other people. */


type PoolPlace = { name: string; kind: string; about: string; ll: { lat: number; lng: number }; persona: string }
type Role = 'food' | 'culture' | 'outdoor'
const ROLES: Role[] = ['food', 'culture', 'outdoor']
const P = (name: string, kind: string, about: string, lat: number, lng: number, persona: string): PoolPlace => ({ name, kind, about, ll: { lat, lng }, persona })
/** Stops by what they are, how much they ask you to spend (0 free, 1 a little, 2 a treat) and whether they're close or a subway ride away. */
const POOL: Record<'near' | 'far', Record<Role, PoolPlace[]>> = {
  near: {
    food: [
      P('Greenmarket Stalls', 'Farmers market', 'A row of market stalls with free samples and good smells. Browse, taste, buy nothing.', 40.7345, -74.0058, 'Biscuit'),
      P('Corner Coffee', 'Neighborhood café', 'A small, friendly coffee shop with a short menu and fresh pastries.', 40.7352, -74.005, 'Pip'),
      P('Chef’s Counter', 'Tasting-menu counter', 'A small counter serving a few courses made in front of you. A proper treat.', 40.7351, -74.0042, 'Prof. Quill'),
    ],
    culture: [
      P('Little Gallery', 'Free art gallery', 'Two small rooms of local art you can walk through in about ten minutes.', 40.7349, -74.0049, 'Juno'),
      P('Paper & Pine', 'Independent bookshop', 'A cozy bookstore with warm lighting and corners to browse. A good place to buy one book.', 40.7345, -74.0035, 'Maple'),
      P('The Record Room', 'Listening bar', 'A dim room with a wall of vinyl and a good sound system. Pick a record and stay for a drink.', 40.7358, -74.003, 'Rex'),
    ],
    outdoor: [
      P('Abingdon Square', 'Small park', 'A little public square with benches and trees. Free and good for a slow breather.', 40.7377, -74.0057, 'Zed'),
      P('Riverside Ice Cream Window', 'Ice cream window', 'A walk-up window by the water with a few flavors. A small treat for the walk.', 40.7338, -74.0104, 'Coco'),
      P('Roof 44', 'Rooftop lounge', 'A rooftop lounge with open views over the skyline. Dress up a little and order something nice.', 40.7372, -74.0016, 'Luna'),
    ],
  },
  far: {
    food: [
      P('Chelsea Market', 'Food hall', 'A big indoor food hall in an old factory. Free to wander through, hard not to taste something.', 40.7424, -74.0061, 'Biscuit'),
      P('Essex Market', 'Market hall', 'A busy market of food stalls and small shops on the Lower East Side. Bring a little cash.', 40.7184, -73.9877, 'Pip'),
      P('Eataly Flatiron', 'Italian market hall', 'A grand Italian market with counters for pasta, wine and sweets. Come hungry.', 40.7421, -73.9897, 'Prof. Quill'),
    ],
    culture: [
      P('Chelsea Gallery Row', 'Free galleries', 'A stretch of West 25th Street lined with free art galleries. Walk in anywhere.', 40.7466, -74.0059, 'Juno'),
      P('Tenement Museum', 'History museum', 'A museum inside real apartment buildings, told through the families who lived there. Tickets needed.', 40.7188, -73.99, 'Maple'),
      P('Whitney Museum', 'Art museum', 'A modern art museum with big windows over the river. Plan an hour or two.', 40.7396, -74.0089, 'Rex'),
    ],
    outdoor: [
      P('The High Line', 'Elevated park', 'A long park built on old train tracks, with gardens and city views. Free and open all day.', 40.748, -74.0048, 'Zed'),
      P('Seward Park', 'Neighborhood park', 'A lively park on the Lower East Side, good for a bench and a snack from the market.', 40.7144, -73.9887, 'Coco'),
      P('Edge Observation Deck', 'Skyline deck', 'The highest outdoor sky deck in the city, high above Hudson Yards. Tickets needed.', 40.7536, -74.001, 'Luna'),
    ],
  },
}

const tierOf = (p: Prefs) => (isTreat(p) ? 2 : isLow(p) ? 1 : 0)

/** Rebuild a story from what you picked in "Adjust the plan". Nothing changes if you left it on the defaults. */
export function applyPrefs(s: Story, p: Prefs): Story {
  const far = p.move === 'Transit'
  const tier = tierOf(p)
  const premise = far ? 'Going farther than usual, because tonight deserves it.' : isTreat(p) ? 'Treat yourself tonight, the good kind of expensive.' : p.who === 'With friends' ? 'Better with people. Bring the group.' : undefined
  const keepStops = !far && tier === 0
  const opening = OPENINGS.find((o) => o.id === s.openingId)
  const isTrip = s.id.startsWith('trip-') || !opening
  let chapters = s.chapters
  if (!isTrip) {
    chapters = keepStops
      ? opening!.chapters.map((c) => ({ ...c }))
      : ROLES.map((role, i) => {
          const list = POOL[far ? 'far' : 'near'][role]
          const raw = list[tier]
          const place = p.dry && DRY_COPY[raw.name] ? { ...raw, ...DRY_COPY[raw.name] } : raw
          const prev = i === 0 ? { lat: 40.7329, lng: -74.0031 } : list === undefined ? null : POOL[far ? 'far' : 'near'][ROLES[i - 1]][tier].ll
          const km = prev ? Math.hypot((place.ll.lat - prev.lat) * 111, (place.ll.lng - prev.lng) * 84) : 1
          const mins = Math.max(4, Math.round((km * 1000) / (far ? 250 : 80)))
          const base = opening!.chapters[i]
          return {
            title: place.name, place: place.name, meta: `${place.name} · 25 min`, mins: 25, desc: place.about, walk: far ? `${mins} min by subway` : `${mins} min walk`,
            persona: place.persona, color: base?.color ?? 'Orange', at: base?.at ?? [30 + i * 25, 60 - i * 15],
            ll: place.ll, kind: place.kind,
            alts: list.filter((_x, k) => k !== tier).map((x) => ({ place: x.name, meta: `${x.name} · 25 min`, persona: x.persona, color: 'Orange' as Colorway, ll: x.ll, kind: x.kind })),
          } satisfies Chapter
        })
  }
  if (p.dry) chapters = chapters.map((c): Chapter => {
    if (!isDrinkPlace(`${c.place} ${c.kind ?? ''}`)) return c
    const alt = c.alts.find((a) => !isDrinkPlace(`${a.place} ${a.kind ?? ''}`))
    return alt
      ? { ...c, place: alt.place, title: alt.place, meta: alt.meta, persona: alt.persona, ll: alt.ll, kind: alt.kind, desc: 'A drink-free take on this stop.' }
      : { ...c, place: 'A quiet tea room', title: 'A quiet tea room', meta: 'A quiet tea room · 25 min', desc: 'A calm room with something warm to drink.', kind: 'Tea room', ll: undefined }
  })
  return { ...s, prefs: p, chapters, premise: premise ?? (opening && !isTrip ? opening.premise : s.premise) }
}

export const ARRIVE_RADIUS = 70 // meters

// ---- game maths ----
export const XP_PER_LEVEL = 120
export const levelOf = (xp: number) => 1 + Math.floor(xp / XP_PER_LEVEL)
export const levelProgress = (xp: number) => (xp % XP_PER_LEVEL) / XP_PER_LEVEL
export const LEVEL_NAMES = ['Hatchling', 'Wanderer', 'Pathfinder', 'Detourist', 'Cartographer', 'Legend']
/** Prototype balancing: limit the XP awarded per detour. Rewards have no cash value. */
export {TRIP_XP_CAP} from '../server/src/reward-rules'
/** A task's share of the trip's 25 XP, weighted by how big the task used to be. */
export function taskXp(s: Story, t: Task): number {
  const total = s.chapters.reduce((a, _c, i) => a + chapterMeta(s, i).tasks.reduce((b, x) => b + x.xp, 0), 0)
  return Math.max(1, Math.floor((TRIP_XP_CAP * t.xp) / (total || 1)))
}

export const levelName = (xp: number) => LEVEL_NAMES[Math.min(levelOf(xp) - 1, LEVEL_NAMES.length - 1)]

// ---- "what happened?" notes ----
export const NOTE_STARTERS = ['I met…', 'We talked about…', 'Plot twist:', 'Fun fact I learned:', 'I never expected…']

/** A prompt that fits the task, so the note invites a story and not a status update. */
export function notePrompt(t: Task): string {
  const x = t.text.toLowerCase()
  if (/hi|talk|ask|chat|barista|owner|stranger|toast|say/.test(x)) return 'Who did you talk to? What did they tell you?'
  if (/order|try|drink|coffee|dumpling|pastry|snack/.test(x)) return 'What did you get? Was it worth it?'
  if (/photo|photograph/.test(x)) return 'What did you capture, and why?'
  if (/book|piece|gallery|read|title|note/.test(x)) return 'What did you pick? What was it about?'
  return 'What happened? Tell it your way.'
}

export const isPhotoTask = (t: Task) => /photo/i.test(t.id) || /photo/i.test(t.text)

export type PhotoLine = { chapter: number; place: string; task: string; img: string }

export function photoLines(s: Story): PhotoLine[] {
  if(s.sharedPhotos)return s.sharedPhotos
  const out: PhotoLine[] = []
  s.chapters.forEach((c, i) => {
    for (const t of chapterMeta(s, i).tasks) {
      const img = s.taskPhotos?.[`${i}:${t.id}`]
      if (img) out.push({ chapter: i, place: c.place, task: t.text, img })
    }
  })
  return out
}

/** Chapter cover: the photo added as a moment, else the first task photo. */
export function chapterImg(s: Story, i: number): string | undefined {
  return (s.moments[i] as { img?: string } | undefined)?.img ?? photoLines(s).find((p) => p.chapter === i)?.img
}

export type NoteLine = { chapter: number; place: string; task: string; note: string }

export function noteLines(s: Story): NoteLine[] {
  if(s.sharedNotes)return s.sharedNotes
  const out: NoteLine[] = []
  s.chapters.forEach((c, i) => {
    const meta = chapterMeta(s, i)
    for (const t of meta.tasks) {
      const n = s.taskNotes?.[`${i}:${t.id}`]?.trim()
      if (n) out.push({ chapter: i, place: c.place, task: t.text, note: n })
    }
  })
  return out
}

export function shareText(s: Story, caps: string[], from = 'Maya'): string {
  const notes = noteLines(s)
  const body = s.chapters
    .map((c, i) => {
      const lines = notes.filter((n) => n.chapter === i).map((n) => `   • ${n.task}\n     “${n.note}”`)
      const pics = photoLines(s).filter((p) => p.chapter === i).length
      return [`${i + 1}. ${c.place}: ${caps[i] ?? ''}`, ...lines, ...(pics ? [`   📷 ${pics} photo${pics > 1 ? 's' : ''}`] : [])].join('\n')
    })
    .join('\n\n')
  return `${s.title}\n${from}’s detour · ${s.date}\n${s.intro?.trim() ? `\n${s.intro.trim()}\n` : ''}\n${body}\n\nMade with Quavi`
}
