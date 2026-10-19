import type { Bg } from "./ui";
// Build-time screenshot variant only. No colour controls or preferences in the app.
export function homeTone(): Bg {
  const tone = import.meta.env.VITE_REVIEW_HOME;
  return tone === "orange-p" || tone === "ink" || tone === "yellow"
    ? tone
    : "paper";
}
