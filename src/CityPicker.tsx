import { useState } from "react";
import { api, accountError } from "./cloud";
import { searchPlace, type Found } from "./places";
import { useStore } from "./store";
import { useTracking, START } from "./tracking";
import type { Opening } from "./data";
import { Btn } from "./ui";

type Results = {
  openings: Opening[];
  notes: string[];
  provider: string;
  updatedAt: string;
};
export function CityPicker({
  onResults,
}: {
  onResults: (result: Results, live: boolean) => void;
}) {
  const { account, s, update } = useStore(),
    tracking = useTracking();
  const [query, setQuery] = useState(""),
    [hits, setHits] = useState<Found[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [minutes, setMinutes] = useState(60);
  const find = async (
    origin: { lat: number; lng: number },
    label: string,
    live: boolean,
  ) => {
    if (!account) return;
    setBusy(true);
    setError("");
    setHits([]);
    try {
      const result = await api<Results>(account, "/detours", "POST", {
        origin,
        label,
        interests: s.user.interests,
        mood: s.mood,
        minutes,
        age21: s.user.age21,
      });
      if(result.openings.length) update(st=>({...st,user:{...st.user,neighborhood:label}}));
      onResults(result, live);
    } catch (e) {
      setError(accountError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="city-picker" aria-label="Find nearby detours" style={{ margin: "8px 0 16px" }}>
      <p className="small" style={{ marginBottom: 10 }}>
        Choose where to start. Opening hours, access and prices aren’t verified.
      </p>
      <div className="field">
        <label htmlFor="detour-city">CITY OR NEIGHBORHOOD</label>
        <input
          id="detour-city"
          placeholder="Try San Francisco or Paris"
          value={query}
          maxLength={120}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <label
        className="row small"
        style={{ gap: 12, minHeight: 48, margin: "8px 0" }}
      >
        Time to wander{" "}
        <select
          aria-label="Time to wander"
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
          style={{
            background: "var(--paper)",
            padding: 10,
            borderRadius: 12,
            font: "inherit",
          }}
        >
          <option value={30}>30 minutes</option>
          <option value={60}>1 hour</option>
          <option value={120}>2 hours</option>
        </select>
      </label>
      <div className="row" style={{ gap: 8 }}>
        <Btn
          style={{
            flex: 1,
            width: 0,
            minWidth: 0,
            padding: "0 12px",
            fontSize: 14,
          }}
          kind="secondary"
          disabled={busy || query.trim().length < 2}
          onClick={async () => {
            setBusy(true);
            setError("");
            setHits([]);
            try {
              const places = await searchPlace(
                query.trim(),
                tracking.mode === "live" ? tracking.pos : START,
              );
              setHits(places);
              if (!places.length)
                setError("No matching area. Try a city or neighborhood name.");
            } catch {
              setError(
                "Place search is unavailable. Try again or use your location.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Finding places…" : "Search area"}
        </Btn>
        <Btn
          style={{
            flex: 1,
            width: 0,
            minWidth: 0,
            padding: "0 12px",
            fontSize: 14,
          }}
          kind="soft"
          disabled={busy}
          onClick={() => {
            if (!navigator.geolocation) {
              setError("Location isn’t available. Search for an area instead.");
              return;
            }
            setBusy(true);
            setError("");
            navigator.geolocation.getCurrentPosition(
              (p) => {
                void find(
                  { lat: p.coords.latitude, lng: p.coords.longitude },
                  "your location",
                  true,
                );
              },
              () => {
                setBusy(false);
                setError(
                  "Couldn’t get your location. Allow access or search for an area.",
                );
              },
              { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
            );
          }}
        >
          Use my location
        </Btn>
      </div>
      {hits.length > 0 && (
        <div
          className="col"
          style={{ gap: 6, marginTop: 10 }}
          aria-label="Matching areas"
        >
          {hits.map((hit) => (
            <button
              key={hit.id}
              className="card"
              disabled={busy}
              style={{ padding: 14, textAlign: "left" }}
              onClick={() => void find(hit.ll, hit.name, false)}
            >
              <b>{hit.name}</b>
              {hit.address && (
                <span className="small muted" style={{ display: "block" }}>
                  {hit.address}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="small" style={{ marginTop: 10 }}>
          {error}
        </p>
      )}
    </section>
  );
}
