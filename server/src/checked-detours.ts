import type { z } from "zod";
import { planDetours, type detourInput, type VenueResult } from "./detours.js";
import type { LiveGeo } from "./google-geo.js";
import { checkHours } from "./live-detours.js";
import type { WalkingProvider } from "./walking.js";
import type { PlaceIdentity } from "./place-identity.js";

/** A bounded search over catalog-only alternatives; every offered path is checked on the pedestrian network. */
export async function checkedDetours(
  raw: VenueResult,
  input: z.infer<typeof detourInput>,
  walking: WalkingProvider,
  live?: LiveGeo,
) {
  const result = planDetours(raw, input),
    openings = [];
  const places = new Map<string, ReturnType<LiveGeo["place"]>>();
  const scoped = live
    ? {
        ...live,
        place: (
          name: string,
          ll: { lat: number; lng: number },
          id?: string,
          context?: PlaceIdentity,
        ) => {
          const key = JSON.stringify([name, ll, id, context]);
          if (!places.has(key))
            places.set(key, live.place(name, ll, id, context));
          return places.get(key)!;
        },
      }
    : undefined;
  const blocked = new Set<string>(),
    tried = new Set<string>();
  let candidates = [...result.openings],
    limited = false;
  const deadline = Date.now() + 35000;
  const alternatives = (skip?: string) =>
    planDetours(
      {
        ...raw,
        venues: raw.venues.filter((v) => !blocked.has(v.id) && v.id !== skip),
      },
      input,
    ).openings;
  const repair = (opening: (typeof candidates)[number]) => {
    // The provider does not identify which leg failed. Explore single-stop substitutions without falsely blaming a venue.
    for (const chapter of [...opening.chapters].reverse()) {
      const replacement = alternatives(chapter.placeId).find(
        (o) => !tried.has(o.chapters.map((c) => c.placeId).join("|")),
      );
      if (replacement) candidates.push(replacement);
    }
  };
  for (let attempt = 0; attempt < 6; attempt++) {
    if (openings.length >= (live ? 2 : 3) || Date.now() > deadline - 10000)
      break;
    const opening = candidates.find(
      (o) =>
        !o.chapters.some((c) => blocked.has(c.placeId)) &&
        !tried.has(o.chapters.map((c) => c.placeId).join("|")),
    );
    if (!opening) break;
    tried.add(opening.chapters.map((c) => c.placeId).join("|"));
    try {
      const route = await walking.check([
        input.origin,
        ...opening.chapters.map((c) => c.ll),
      ]);
      if (!route) {
        repair(opening);
        continue;
      }
      const walkMinutes = Math.ceil(route.duration / 60);
      if (walkMinutes + 15 > input.minutes) {
        repair(opening);
        continue;
      }
      const stay = Math.max(
        5,
        Math.min(20, Math.floor((input.minutes - walkMinutes) / 3)),
      );
      const hours = scoped
        ? await checkHours(
            scoped,
            opening.chapters.map((c) => ({
              name: c.place,
              ll: c.ll,
              mins: stay,
              kind: c.kind,
              aliases: c.aliases,
            })),
            route,
          )
        : undefined;
      if (
        hours?.some(
          (h) => h.status === "closed" || h.venueStatus === "unsuitable",
        )
      ) {
        opening.chapters.forEach((c, i) => {
          if (
            hours[i].status === "closed" ||
            hours[i].venueStatus === "unsuitable"
          )
            blocked.add(c.placeId);
        });
        candidates = [...alternatives(), ...candidates];
        continue;
      }
      openings.push({
        ...opening,
        id: live ? `${opening.id}-${attempt}` : opening.id,
        estimatedMinutes: walkMinutes + stay * 3,
        timeBudgetMinutes: input.minutes,
        walking: route,
        tags: `Nearby · approx. ${walkMinutes + stay * 3} min · ${!hours ? "hours unverified" : hours.every((h) => h.status === "open") ? "reported open for your visit" : "some hours unknown"}`,
        chapters: opening.chapters.map((c, i) => ({
          ...c,
          mins: stay,
          ...(hours
            ? {
                hours: hours[i],
                googlePlaceId: hours[i].googlePlaceId,
                googleRoute: true,
                meta: `${c.kind} · ${hours[i].status === "open" ? "reported open for your visit" : "hours unknown"}`,
              }
            : {}),
          walk: `${Math.max(1, Math.ceil(route.legs[i].duration / 60))} min walk`,
          walking: route.legs[i],
        })),
      });
    } catch (e) {
      if (!openings.length) throw e;
      limited = true;
      break;
    }
  }
  return {
    ...result,
    openings,
    notes: openings.length
      ? [
          "Pedestrian routes checked against the mapped path network. Reported hours cover arrival and your planned stay when available. Entry, tickets, accessibility and current street conditions still need checking.",
          ...(limited
            ? [
                "Some additional checks were unavailable. Showing only routes checked in this request.",
              ]
            : []),
        ]
      : [
          "No three-stop outing fits the available venues, reported hours and walking time here. Try another area, more time or a different time of day.",
        ],
  };
}
