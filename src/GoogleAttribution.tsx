import { useEffect, useState } from "react";
import type { HoursCheck } from "./data";
export function hoursLabel(hours?: HoursCheck) {
  if (
    !hours ||
    !Number.isFinite(Date.parse(hours.checkedAt)) ||
    Date.now() - Date.parse(hours.checkedAt) > 300000
  )
    return "Hours not checked";
  if (hours.venueStatus === "unsuitable") return "Venue needs replacing";
  return hours.status === "open"
    ? "Reported open for your visit"
    : hours.status === "closed"
      ? "Reported closed for your visit"
      : "Hours unknown";
}
export function useLiveHoursClock() {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(timer);
  }, []);
}
export function GoogleAttribution({
  hours = [],
  dark = false,
  onMap = false,
}: {
  hours?: (HoursCheck | undefined)[];
  dark?: boolean;
  onMap?: boolean;
}) {
  const providers = [
    ...new Map(
      hours
        .flatMap((h) => h?.attributions ?? [])
        .map((p) => [p.displayName, p]),
    ).values(),
  ];
  if(onMap&&!providers.length)return null;
  return (
    <div
      style={{
        padding: "5px 7px",
        background: dark ? "#1F1F1F" : "#FFFFFF",
        color: dark ? "#FFFFFF" : "#1F1F1F",
        borderRadius: 8,
        display: "inline-flex",
        alignItems: "center",
        alignSelf: "flex-start",
        flexWrap: "wrap",
        gap: 7,
        margin: "6px 0",
        maxWidth: "100%",
        fontSize: 12,
        fontFamily: "var(--sans)",
        fontWeight: 400,
        lineHeight: 1.5,
      }}
    >
      {!onMap&&<img
        src={`/google-maps-${dark ? "white" : "dark"}.svg`}
        alt="Google Maps"
        style={{
          height: 16,
          flexShrink: 0,
          width: "auto",
          display: "block",
          maxWidth: "100%",
        }}
      />}
      {providers.map((p) => (
        <span key={p.displayName} style={{ display: "inline" }}>
          {p.uri?.startsWith("https://") ? (
            <a href={p.uri} target="_blank" rel="noreferrer">
              {p.displayName}
            </a>
          ) : (
            p.displayName
          )}
        </span>
      ))}
    </div>
  );
}

/** Reported opening hours do not establish admission, ticket availability or an accessible entrance. */
export function VenueEntry({ hours }: { hours?: HoursCheck }) {
  const fresh = hours && Date.now() - Date.parse(hours.checkedAt) <= 300000;
  const href = fresh ? (hours?.websiteURL ?? hours?.mapsURL) : undefined;
  return (
    <p className="small muted" style={{ margin: "4px 0 10px" }}>
      Entry &amp; tickets unverified
      {href && (
        <>
          {" "}
          ·{" "}
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: "underline" }}
          >
            Check venue details
          </a>
        </>
      )}
    </p>
  );
}
