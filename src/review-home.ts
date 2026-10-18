import type { Bg } from "./ui";
export const reviewEnabled = import.meta.env.VITE_REVIEW_BOARD === "true";
export const homeTones = ["orange-p", "ink", "yellow"] as const;
export function homeTone(): Bg {
  if (!reviewEnabled) return "paper";
  const tone = localStorage.getItem("quavi.review.home");
  return homeTones.includes(tone as (typeof homeTones)[number])
    ? (tone as Bg)
    : "paper";
}
export function chooseHomeTone(tone: (typeof homeTones)[number]) {
  localStorage.setItem("quavi.review.home", tone);
}
