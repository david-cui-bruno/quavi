export {demoWalk} from './demo-route.mjs'
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
