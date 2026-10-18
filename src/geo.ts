export type LatLng = { lat: number; lng: number }

const R = 6371000
const rad = (d: number) => (d * Math.PI) / 180

/** Great-circle distance in meters. */
export function distance(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

/** Move `from` toward `to` by `meters` (straight line; fine at city scale). */
export function stepToward(from: LatLng, to: LatLng, meters: number): LatLng {
  const d = distance(from, to)
  if (d <= meters) return { ...to }
  const t = meters / d
  return { lat: from.lat + (to.lat - from.lat) * t, lng: from.lng + (to.lng - from.lng) * t }
}

export const fmtDist = (m: number) => (m < 1000 ? `${Math.round(m / 5) * 5} m` : `${(m / 1000).toFixed(1)} km`)
export const fmtWalk = (m: number) => `${Math.max(1, Math.round(m / 80))} min walk`

/** Equirectangular projection of points into a w x h box with padding. */
export function makeProjector(points: LatLng[], w: number, h: number, pad = 54) {
  const lats = points.map((p) => p.lat)
  const lngs = points.map((p) => p.lng)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const cosLat = Math.cos(rad((minLat + maxLat) / 2))
  const spanX = Math.max((maxLng - minLng) * cosLat, 1e-5)
  const spanY = Math.max(maxLat - minLat, 1e-5)
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY)
  const offX = (w - spanX * scale) / 2
  const offY = (h - spanY * scale) / 2
  return (p: LatLng) => ({
    x: offX + (p.lng - minLng) * cosLat * scale,
    y: offY + (maxLat - p.lat) * scale,
  })
}
