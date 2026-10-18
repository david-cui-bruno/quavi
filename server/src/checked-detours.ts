import type { z } from "zod";
import { planDetours, type detourInput, type VenueResult } from "./detours.js";
import type { WalkingProvider } from "./walking.js";

/** Rank cheaply, then validate the actual pedestrian network before offering a route. No straight-line fallback. */
export async function checkedDetours(
  raw: VenueResult,
  input: z.infer<typeof detourInput>,
  walking: WalkingProvider,
) {
  const result = planDetours(raw, input),
    openings = [];
  for (const opening of result.openings) {
    const route = await walking.check([
      input.origin,
      ...opening.chapters.map((c) => c.ll),
    ]);
    if (!route) continue;
    const walkMinutes = Math.ceil(route.duration / 60);
    if (walkMinutes + 15 > input.minutes) continue;
    const stay = Math.max(
      5,
      Math.min(20, Math.floor((input.minutes - walkMinutes) / 3)),
    );
    openings.push({
      ...opening,
      estimatedMinutes: walkMinutes + stay * 3,
      timeBudgetMinutes: input.minutes,
      walking: route,
      tags: `Nearby · approx. ${walkMinutes + stay * 3} min · hours unverified`,
      chapters: opening.chapters.map((c, i) => ({
        ...c,
        mins: stay,
        walk: `${Math.max(1, Math.ceil(route.legs[i].duration / 60))} min walk`,
        walking: route.legs[i],
      })),
    });
  }
  return {
    ...result,
    openings,
    notes: openings.length
      ? [
          "Pedestrian routes checked against the mapped path network. Hours, prices, entrances and current street conditions still need checking.",
        ]
      : [
          "No three-stop walking route fits this area and time limit. Try another starting point or allow more time.",
        ],
  };
}
