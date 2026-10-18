import { useEffect, useState } from "react";
import type { HoursCheck } from "./data";
export function hoursLabel(hours?: HoursCheck) {
  if (
    !hours ||
    !Number.isFinite(Date.parse(hours.checkedAt)) ||
    Date.now() - Date.parse(hours.checkedAt) > 300000
  )
    return "Hours not checked";
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
}: {
  hours?: (HoursCheck | undefined)[];
  dark?: boolean;
}) {
  const providers = [
    ...new Map(
      hours
        .flatMap((h) => h?.attributions ?? [])
        .map((p) => [p.displayName, p]),
    ).values(),
  ];
  return (
    <div
      style={{
        padding: "10px 10px 5px",
        background: dark ? "#1F1F1F" : "#FFFFFF",
        color: dark ? "#FFFFFF" : "#1F1F1F",
        borderRadius: 8,
        display: "inline-block",
        maxWidth: "100%",
        fontSize: 12,
        fontFamily: "var(--sans)",
        fontWeight: 400,
        lineHeight: 1.5,
      }}
    >
      <span style={{ display: "block", marginBottom: 4 }}>
        Hours &amp; walking
      </span>
      <img
        src={`/google-maps-${dark ? "white" : "dark"}.svg`}
        alt="Google Maps"
        style={{
          height: 18,
          width: "auto",
          display: "block",
          maxWidth: "100%",
        }}
      />
      {providers.map((p) => (
        <span key={p.displayName} style={{ display: "block", marginTop: 5 }}>
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
