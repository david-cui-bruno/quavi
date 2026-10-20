import { z } from "zod";
import type { LiveGeo } from "./google-geo.js";
import { evaluateHours, type HoursCheck } from "./google-hours.js";
import { walkingInput, type WalkingCheck } from "./walking.js";
export const liveStop = z
  .object({
    name: z.string().trim().min(1).max(200),
    ll: z
      .object({
        lat: z.number().min(-85).max(85),
        lng: z.number().min(-180).max(180),
      })
      .strict(),
    mins: z.number().int().min(1).max(120),
    kind: z.string().max(80).optional(),
    aliases: z.array(z.string().trim().min(1).max(200)).max(8).optional(),
    googlePlaceId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,300}$/)
      .optional(),
  })
  .strict();
export const liveCheckInput = z
  .object({
    points: walkingInput.shape.points,
    stops: z.array(liveStop).min(1).max(3),
  })
  .strict()
  .superRefine((v, c) => {
    if (
      v.points.length !== v.stops.length + 1 ||
      v.stops.some(
        (s, i) =>
          s.ll.lat !== v.points[i + 1]?.lat ||
          s.ll.lng !== v.points[i + 1]?.lng,
      )
    )
      c.addIssue({
        code: "custom",
        message: "Stop coordinates must match walking points",
      });
    if (!walkingInput.safeParse({ points: v.points }).success)
      c.addIssue({ code: "custom", message: "Stops exceed walking range" });
  });
export async function checkHours(
  geo: LiveGeo,
  stops: z.infer<typeof liveStop>[],
  walking: WalkingCheck,
  now = new Date(),
): Promise<HoursCheck[]> {
  let elapsed = 0;
  const windows = stops.map((s, i) => {
    elapsed += walking.legs[i].duration;
    const arrival = new Date(now.getTime() + elapsed * 1000);
    elapsed += s.mins * 60;
    return { arrival, leave: new Date(now.getTime() + elapsed * 1000) };
  });
  return await Promise.all(
    stops.map(async (s, i) =>
      evaluateHours(
        await geo.place(s.name, s.ll, s.googlePlaceId, {
          kind: s.kind,
          aliases: s.aliases,
        }),
        s.ll,
        windows[i].arrival,
        windows[i].leave,
        now,
      ),
    ),
  );
}

/** Identity/category checks only. Legacy `hours` shape remains for older clients;
 * route planning deliberately does not request or evaluate opening hours. */
export async function checkVenues(geo: LiveGeo, stops: z.infer<typeof liveStop>[]): Promise<HoursCheck[]> {
  const now = new Date().toISOString();
  return Promise.all(stops.map(async s => {
    const place = await geo.place(s.name,s.ll,s.googlePlaceId,{kind:s.kind,aliases:s.aliases});
    const base: HoursCheck = {status:'unknown',checkedAt:now,arrivalAt:now,leaveAt:now,attributions:[],venueStatus:'unverified'};
    if (!place) return base;
    if ('rejected' in place) return {...base,venueStatus:'unsuitable',venueIssue:place.rejected};
    return {...base,venueStatus:'matched',googlePlaceId:place.id,mapsURL:place.googleMapsUri,attributions:place.attributions.map(a=>({displayName:a.provider??'Data provider',uri:a.providerUri}))};
  }));
}
