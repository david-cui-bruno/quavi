import legs from "./demo-walks.json";
import type { LatLng } from "./geo";
const same = (a: LatLng, b: LatLng) =>
  Math.abs(a.lat - b.lat) < 0.000001 && Math.abs(a.lng - b.lng) < 0.000001;
/** Authored OSM foot-network snapshots for the fixed sample stops only; never used for live navigation. */
export function demoWalk(points: LatLng[]): LatLng[] {
  const path: LatLng[] = [];
  for (let i = 1; i < points.length; i++) {
    const leg = legs.find(
      (l) => same(l.from, points[i - 1]) && same(l.to, points[i]),
    );
    if (!leg) return [];
    path.push(...leg.geometry);
  }
  return path;
}
export function DemoRouteCredit() {
  return (
    <div className="demo-route-credit">
      Sample walk ·{" "}
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
      >
        © OpenStreetMap
      </a>{" "}
      ·{" "}
      <a
        href="https://www.openstreetmap.org/fixthemap"
        target="_blank"
        rel="noreferrer"
      >
        Fix the map
      </a>
    </div>
  );
}
