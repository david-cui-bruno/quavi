import { isDrinkPlace } from './data'
import { distance, type LatLng } from './geo'

/** A real place from OpenStreetMap (searched via Photon / Nominatim, both free and key-less). */
export type Found = {
  id: string
  name: string
  ll: LatLng
  kind: string
  about: string
  address?: string
  /** metres off the straight line to the destination (side quests only) */
  off?: number
}

const KINDS: Record<string, string> = {
  'amenity:cafe': 'Café', 'amenity:bar': 'Bar', 'amenity:pub': 'Pub', 'amenity:ice_cream': 'Ice cream', 'amenity:library': 'Library',
  'amenity:restaurant': 'Restaurant', 'amenity:fast_food': 'Quick bite', 'amenity:bakery': 'Bakery', 'amenity:theatre': 'Theater',
  'amenity:cinema': 'Cinema', 'amenity:arts_centre': 'Arts centre', 'leisure:park': 'Park', 'leisure:garden': 'Garden', 'leisure:playground': 'Playground',
  'tourism:gallery': 'Art gallery', 'tourism:museum': 'Museum', 'tourism:artwork': 'Public art', 'tourism:attraction': 'Landmark',
  'shop:bakery': 'Bakery', 'shop:books': 'Bookshop', 'shop:coffee': 'Coffee shop', 'shop:tea': 'Tea shop', 'shop:ice_cream': 'Ice cream',
  'shop:records': 'Record shop', 'shop:art': 'Art shop', 'shop:convenience': 'Corner store',
}

const ABOUT: Record<string, string> = {
  'Café': 'A café for a drink and a sit-down. Easy to be there for twenty minutes.',
  'Tea shop': 'A tea shop with drinks made to order. Quick to grab something and keep walking.',
  'Coffee shop': 'A coffee shop for a quick stop. Good for a drink and a look around.',
  'Bar': 'A neighborhood bar. Good for one drink and a bit of people-watching.',
  'Pub': 'A pub with a relaxed room and a drink list. Good for one round.',
  'Ice cream': 'A place for something cold and sweet. A small treat on the way.',
  'Library': 'A quiet library. Free to walk in and browse.',
  'Restaurant': 'A sit-down restaurant. Worth a stop if you’re hungry.',
  'Quick bite': 'A fast, cheap place to grab a bite and keep moving.',
  'Bakery': 'A bakery with fresh bread and pastries. Something warm to carry along.',
  'Theater': 'A theater. See what’s playing tonight.',
  'Arts centre': 'An arts centre with exhibitions and events. Worth a look inside.',
  'Cinema': 'A cinema. A good plan B if the weather turns.',
  'Park': 'A public park with benches and trees. Free, open and good for a slow breather.',
  'Garden': 'A small garden. Free, quiet and easy to miss.',
  'Playground': 'A neighborhood playground. Lively in the daytime.',
  'Art gallery': 'A gallery of local art. Usually free to walk through.',
  'Museum': 'A museum. Worth an hour if you’re curious.',
  'Public art': 'A piece of public art, free to look at any time.',
  'Landmark': 'A local landmark worth a look.',
  'Bookshop': 'A bookshop to browse. No need to buy anything.',
  'Record shop': 'A record shop to flip through. Sometimes there’s music playing.',
  'Art shop': 'A small art shop to browse.',
  'Corner store': 'A corner store for a snack or a drink.',
}

const SEARCHES: { q: string; kind: string }[] = [
  { q: 'cafe', kind: 'Café' },
  { q: 'park', kind: 'Park' },
  { q: 'art gallery', kind: 'Art gallery' },
  { q: 'bakery', kind: 'Bakery' },
  { q: 'bookshop', kind: 'Bookshop' },
]

const humanize = (s: string) => s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

function kindOf(key: string | undefined, value: string | undefined, name: string): string {
  if (/tea|boba|bubble/i.test(name)) return 'Tea shop'
  if (key && value && KINDS[`${key}:${value}`]) return KINDS[`${key}:${value}`]
  return value ? humanize(value) : 'Local stop'
}

export const aboutFor = (kind: string) => ABOUT[kind] ?? `A local ${kind.toLowerCase()} picked for your route.`

/** Minutes to walk a distance (~80 m per minute). */
export const walkMins = (m: number) => Math.max(1, Math.round(m / 80))

/** Metres from point p to the segment a→b (local flat-earth approximation, fine at city scale). */
export function offSegment(p: LatLng, a: LatLng, b: LatLng): number {
  const k = Math.cos((a.lat * Math.PI) / 180)
  const x = (q: LatLng) => (q.lng - a.lng) * k, y = (q: LatLng) => q.lat - a.lat
  const [px, py, bx, by] = [x(p), y(p), x(b), y(b)]
  const len2 = bx * bx + by * by
  const t = len2 ? Math.max(0, Math.min(1, (px * bx + py * by) / len2)) : 0
  const closest: LatLng = { lat: a.lat + (by * t), lng: a.lng + (bx * t) / k }
  return distance(p, closest)
}

type PhotonFeature = { properties: Record<string, string | undefined>; geometry: { coordinates: [number, number] } }

/** Look up a place by name, biased towards `near`. Returns the best few matches. */
export async function searchPlace(query: string, near: LatLng, signal?: AbortSignal): Promise<Found[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lat=${near.lat}&lon=${near.lng}&limit=6&lang=en`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const data = (await res.json()) as { features: PhotonFeature[] }
  const hits = data.features
    .filter((f) => f.properties.name)
    .map((f) => {
      const p = f.properties
      const name = p.name as string
      const kind = kindOf(p.osm_key, p.osm_value, name)
      const ll = { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] }
      const address = [p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street, p.locality ?? p.city].filter(Boolean).join(', ')
      return { id: `${p.osm_type}${p.osm_id}`, name, ll, kind, about: aboutFor(kind), address: address || undefined } as Found
    })
  // prefer what's close by
  return hits.sort((a, b) => distance(near, a.ll) - distance(near, b.ll)).slice(0, 5)
}

/** Places a few steps off the straight line from `a` to `b`, one category at a time (Nominatim allows ~1 request/second). */
export async function sideQuestsAlong(a: LatLng, b: LatLng, exclude: string, onBatch: (found: Found[]) => void, signal?: AbortSignal, dry = false): Promise<void> {
  const pad = 0.0028
  const west = Math.min(a.lng, b.lng) - pad, east = Math.max(a.lng, b.lng) + pad
  const south = Math.min(a.lat, b.lat) - pad, north = Math.max(a.lat, b.lat) + pad
  const seen = new Set<string>([exclude.toLowerCase()])
  for (let i = 0; i < SEARCHES.length; i++) {
    if (signal?.aborted) return
    const { q, kind } = SEARCHES[i]
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&viewbox=${west},${north},${east},${south}&bounded=1&format=jsonv2&limit=6&addressdetails=1`
    try {
      const res = await fetch(url, { signal })
      if (res.ok) {
        const rows = (await res.json()) as { place_id: number; name?: string; display_name: string; lat: string; lon: string; category: string; type: string; address?: Record<string, string> }[]
        const batch: Found[] = []
        for (const r of rows) {
          const name = r.name || r.display_name.split(',')[0]
          if (!name || seen.has(name.toLowerCase())) continue
          if (dry && isDrinkPlace(`${name} ${r.type}`)) continue
          const ll = { lat: Number(r.lat), lng: Number(r.lon) }
          const off = offSegment(ll, a, b)
          if (off > 260) continue
          seen.add(name.toLowerCase())
          const k = kindOf(r.category, r.type, name) === 'Local stop' ? kind : kindOf(r.category, r.type, name)
          const street = r.address?.road
          batch.push({ id: `n${r.place_id}`, name, ll, kind: k, about: aboutFor(k), address: street ? `${r.address?.house_number ? r.address.house_number + ' ' : ''}${street}` : undefined, off })
        }
        if (batch.length) onBatch(batch)
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
    if (i < SEARCHES.length - 1) await new Promise((r) => setTimeout(r, 1100))
  }
}
