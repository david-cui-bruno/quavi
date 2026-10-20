import legs from "./demo-walks.json" with { type: "json" };
const same = (a, b) =>
  Math.abs(a.lat - b.lat) < 0.000001 && Math.abs(a.lng - b.lng) < 0.000001;
/** Only known sample legs. An unmatched stop never becomes an invented connecting line. */
export function demoWalk(points) {
  const path = [];
  for (let i = 1; i < points.length; i++) {
    const leg = legs.find(
      (l) => same(l.from, points[i - 1]) && same(l.to, points[i]),
    );
    if (!leg) return [];
    path.push(...leg.geometry);
  }
  return path;
}
/** Resume from the nearest segment of the authored walk instead of walking back to its start. */
export function resumeDemoWalk(path, pos) {
  if (path.length < 2) return [];
  const k = Math.cos((pos.lat * Math.PI) / 180);
  let best = Infinity,
    index = 0,
    point = path[0];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i],
      b = path[i + 1],
      dx = (b.lng - a.lng) * k,
      dy = b.lat - a.lat;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((pos.lng - a.lng) * k * dx + (pos.lat - a.lat) * dy) /
          (dx * dx + dy * dy) || 0,
      ),
    );
    const p = {
      lat: a.lat + (b.lat - a.lat) * t,
      lng: a.lng + (b.lng - a.lng) * t,
    };
    const d = ((p.lng - pos.lng) * k) ** 2 + (p.lat - pos.lat) ** 2;
    if (d < best) {
      best = d;
      index = i;
      point = p;
    }
  }
  return [point, ...path.slice(index + 1)];
}
