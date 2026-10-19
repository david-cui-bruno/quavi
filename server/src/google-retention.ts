/** Google responses live only in memory. Keep independent venue data, allowed place IDs and the user's own content. */
export function scrubGoogleContent(value: unknown): any {
  if (Array.isArray(value)) return value.map(scrubGoogleContent);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, any>;
  const googleRoute = record.walking?.provider === "Google Maps";
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (["hours", "googleRoute", "venuePhoto", "photos", "photoUri"].includes(key)) continue;
    if (googleRoute && ["walking", "estimatedMinutes"].includes(key)) continue;
    if (record.googleRoute && ["walking", "walk"].includes(key)) continue;
    out[key] = scrubGoogleContent(item);
  }
  if (record.googleRoute) {
    out.walk = "Check walking route";
    out.meta = (record.kind ?? "Stop") + " · hours not checked";
  }
  return out;
}
