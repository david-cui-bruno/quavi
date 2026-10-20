import type { HoursCheck } from "./data";
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
