import { useEffect, useId, useRef, useState } from "react";
import { searchPlace, type Found } from "./places";
import type { LatLng } from "./geo";
import { Arrow } from "./ui";

/** A chosen result, including its coordinates, is passed through to route planning. Never silently pick hits[0]. */
export function PlaceSearch({
  value,
  onChange,
  onChoose,
  near,
  onBack,
  explore = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onChoose: (place: Found) => void;
  near: LatLng;
  onBack?: () => void;
  explore?: boolean;
}) {
  const id = useId(),
    box = useRef<HTMLFormElement>(null),
    input = useRef<HTMLInputElement>(null),
    abort = useRef<AbortController | null>(null),
    sequence = useRef(0),
    nearRef = useRef(near);
  const [hits, setHits] = useState<Found[]>([]),
    [phase, setPhase] = useState<"idle" | "loading" | "ready" | "error">(
      "idle",
    ),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(-1);
  nearRef.current = near;
  const lookup = async (query: string) => {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    const ticket = ++sequence.current;
    setOpen(true);
    setPhase("loading");
    setHits([]);
    setActive(-1);
    try {
      const result = await searchPlace(query, nearRef.current, ac.signal);
      if (ac.signal.aborted || ticket !== sequence.current) return;
      setHits(result);
      setPhase("ready");
    } catch {
      if (!ac.signal.aborted && ticket === sequence.current) setPhase("error");
    }
  };
  useEffect(() => {
    abort.current?.abort();
    sequence.current++;
    setHits([]);
    setActive(-1);
    setPhase("idle");
    if (!open || value.trim().length < 3) return;
    const timer = window.setTimeout(() => void lookup(value.trim()), 500);
    return () => {
      window.clearTimeout(timer);
      abort.current?.abort();
    };
  }, [value]); // Opening/closing the list does not reissue an unchanged query.
  useEffect(
    () => () => {
      sequence.current++;
      abort.current?.abort();
    },
    [],
  );
  const choose = (hit: Found) => {
    abort.current?.abort();
    sequence.current++;
    setOpen(false);
    onChange(hit.name);
    input.current?.blur();
    onChoose(hit);
  };
  const shown = open && value.trim().length >= 2;
  return (
    <form
      ref={box}
      data-map-top-obstruction
      className="place-search abs"
      onSubmit={(e) => {
        e.preventDefault();
        if (active >= 0 && hits[active]) choose(hits[active]);
        else if (value.trim().length >= 2) void lookup(value.trim());
      }}
      style={{
        left: 24,
        right: 24,
        top: "var(--screen-top, 54px)",
        zIndex: 50,
        bottom: shown ? 16 : undefined,
        display: "flex",
        flexDirection: "column",
        pointerEvents: "none",
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <div
        className="row"
        style={{
          height: explore ? 64 : 56,
          flexShrink: 0,
          pointerEvents: "auto",
          borderRadius: 32,
          background: "var(--white)",
          padding: "0 12px",
          gap: 8,
          boxShadow: "0 4px 18px rgba(30,27,22,.18)",
        }}
      >
        {onBack ? (
          <button
            type="button"
            className="hit44"
            aria-label="Back"
            onClick={onBack}
          >
            <span
              style={{ display: "inline-flex", transform: "rotate(180deg)" }}
            >
              <Arrow size={20} />
            </span>
          </button>
        ) : (
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            aria-hidden="true"
          >
            <circle cx="10" cy="10" r="6.5" />
            <path d="m15 15 5 5" />
          </svg>
        )}
        <div className="col" style={{ flex: 1, minWidth: 0 }}>
          {explore && (
            <label
              htmlFor={id}
              style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".08em" }}
            >
              WHERE TO?
            </label>
          )}
          <input
            ref={input}
            id={id}
            role="combobox"
            aria-label={explore ? "Where to?" : "Search places"}
            aria-autocomplete="list"
            aria-expanded={shown}
            aria-controls={id + "-results"}
            aria-activedescendant={active >= 0 ? id + "-" + active : undefined}
            autoComplete="off"
            maxLength={120}
            placeholder="Search a place or address"
            value={value}
            style={{ fontSize: 16, width: "100%", fontWeight: 500 }}
            onChange={(e) => {
              setOpen(true);
              onChange(e.target.value);
            }}
            onFocus={() => {
              if (value.trim().length >= 2) setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setOpen(true);
                setActive((a) => Math.min(hits.length - 1, a + 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(-1, a - 1));
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
                setActive(-1);
              }
            }}
          />
        </div>
        {value && (
          <button
            type="button"
            className="hit44"
            aria-label="Clear search"
            onClick={() => {
              abort.current?.abort();
              sequence.current++;
              onChange("");
              setHits([]);
              setOpen(false);
              input.current?.focus();
            }}
          >
            ×
          </button>
        )}
        <button
          type="submit"
          className="round ink"
          aria-label="Find places"
          disabled={value.trim().length < 2}
          style={{ width: 40, height: 40, flex: "none" }}
        >
          <Arrow size={18} />
        </button>
      </div>
      {shown && (
        <div
          className="place-suggestions"
          style={{
            background: "var(--white)",
            borderRadius: 20,
            marginTop: 8,
            boxShadow: "0 8px 24px rgba(30,27,22,.18)",
            maxHeight: 320,
            minHeight: 0,
            pointerEvents: "auto",
            overflowY: "auto",
            overflowX: "hidden",
            padding: 8,
          }}
        >
          {phase === "loading" && (
            <p className="small" role="status" style={{ padding: 12 }}>
              Finding places…
            </p>
          )}
          {phase === "idle" && (
            <p className="small" role="status" style={{ padding: 12 }}>
              {value.trim().length < 3
                ? "Type another letter or tap the arrow to search."
                : "Choose a matching place below."}
            </p>
          )}
          {phase === "error" && (
            <p className="small" role="alert" style={{ padding: 12 }}>
              Place search couldn’t connect. Tap the arrow to retry.
            </p>
          )}
          {phase === "ready" && !hits.length && (
            <p className="small" role="status" style={{ padding: 12 }}>
              No matching places. Add a city or street name.
            </p>
          )}
          <div role="listbox" id={id + "-results"} aria-label="Matching places">
            {hits.map((hit, i) => (
              <button
                type="button"
                role="option"
                aria-selected={active === i}
                id={id + "-" + i}
                key={hit.id}
                tabIndex={-1}
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(hit)}
                style={{
                  display: "block",
                  width: "100%",
                  minHeight: 56,
                  padding: 12,
                  textAlign: "left",
                  borderRadius: 12,
                  background: active === i ? "var(--soft)" : "transparent",
                  overflowWrap: "anywhere",
                }}
              >
                <b style={{ display: "block", fontSize: 16 }}>{hit.name}</b>
                <span
                  className="small muted"
                  style={{ display: "block", marginTop: 3 }}
                >
                  {hit.address ?? hit.kind}
                </span>
              </button>
            ))}
          </div>
          {!!hits.length && (
            <p className="small muted" style={{ padding: "6px 12px" }}>
              Choose the place you mean · OpenStreetMap
            </p>
          )}
        </div>
      )}
    </form>
  );
}
