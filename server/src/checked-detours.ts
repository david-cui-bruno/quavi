import type { z } from "zod";
import { planDetours, type detourInput, type VenueResult } from "./detours.js";
import type { LiveGeo } from "./google-geo.js";
import { checkHours } from "./live-detours.js";
import type { WalkingProvider } from "./walking.js";

/** Rank cheaply, then validate the actual pedestrian network before offering a route. No straight-line fallback. */
export async function checkedDetours(
  raw: VenueResult,
  input: z.infer<typeof detourInput>,
  walking: WalkingProvider,
  live?: LiveGeo,
) {
  const result = planDetours(raw, input),
    openings = [];
  const places = new Map();
  const scoped = live
    ? {
        ...live,
        place: (
          name: string,
          ll: { lat: number; lng: number },
          id?: string,
        ) => {
          const key = JSON.stringify([name, ll, id]);
          if (!places.has(key)) places.set(key, live.place(name, ll, id));
          return places.get(key);
        },
      }
    : undefined;
  const blocked=new Set<string>(),tried=new Set<string>();
  let candidates=result.openings;
  const deadline=Date.now()+35000;
  for(let attempt=0;attempt<(live?6:3);attempt++){
    if(live&&(openings.length>=2||Date.now()>deadline-10000))break;
    const opening=candidates.find(o=>!tried.has(o.chapters.map(c=>c.placeId).join('|')));
    if(!opening)break;
    tried.add(opening.chapters.map(c=>c.placeId).join('|'));
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
    const hours = scoped
      ? await checkHours(
          scoped,
          opening.chapters.map((c) => ({
            name: c.place,
            ll: c.ll,
            mins: stay,
          })),
          route,
        )
      : undefined;
    if(hours?.some(h=>h.status==='closed')){
      opening.chapters.forEach((c,i)=>{if(hours[i].status==='closed')blocked.add(c.placeId)});
      candidates=planDetours({...raw,venues:raw.venues.filter(v=>!blocked.has(v.id))},input).openings;
      continue;
    }
    openings.push({
      ...opening,
      id:live?`${opening.id}-${attempt}`:opening.id,
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
  }
  return {
    ...result,
    openings,
    notes: openings.length
      ? [
          "Pedestrian routes checked against the mapped path network. Reported hours are checked for arrival and your planned stay when available. Prices, entrances and current street conditions still need checking.",
        ]
      : [
          "No three-stop outing fits the available hours and walking time here. Try another area, more time or a different time of day.",
        ],
  };
}
