import { z } from "zod";
import { meters, type Point } from "./detours.js";

const point = z
  .object({
    lat: z.number().min(-85).max(85),
    lng: z.number().min(-180).max(180),
  })
  .strict();
export const walkingInput = z
  .object({ points: z.array(point).min(2).max(4) })
  .strict()
  .refine(
    (v) => v.points.every((p) => meters(v.points[0], p) <= 6000),
    "Walking stops must be within 6 km of the start",
  );
export type WalkingLeg = { distance: number; duration: number };
export type WalkingCheck = {
  legs: WalkingLeg[];
  distance: number;
  duration: number;
  checkedAt: string;
  provider: string;
};
export interface WalkingProvider {
  check(points: Point[]): Promise<WalkingCheck | null>;
}
const scalar = z.number().finite().nonnegative();
const response = z.object({
  code: z.literal("Ok"),
  waypoints: z.array(
    z.object({
      distance: scalar,
      location: z.tuple([
        z.number().min(-180).max(180),
        z.number().min(-85).max(85),
      ]),
    }),
  ),
  routes: z
    .array(
      z.object({
        distance: scalar,
        duration: scalar,
        legs: z.array(z.object({ distance: scalar, duration: scalar })),
      }),
    )
    .min(1),
});
/** A successful engine response is insufficient: reject remote snaps and unreasonable pedestrian legs. */
export function parseWalkingCheck(
  raw: unknown,
  points: Point[],
  now = new Date(),
): WalkingCheck | null {
  const parsed = response.safeParse(raw);
  if (!parsed.success) return null;
  const data = parsed.data,
    r = data.routes[0];
  if (
    data.waypoints.length !== points.length ||
    r.legs.length !== points.length - 1
  )
    return null;
  if (
    data.waypoints.some(
      (w, i) =>
        w.distance > 100 ||
        meters(points[i], { lng: w.location[0], lat: w.location[1] }) > 100,
    )
  )
    return null;
  if (
    r.legs.some(
      (l, i) =>
        l.distance > 4000 ||
        l.duration > 3600 ||
        l.distance + 50 < meters(points[i], points[i + 1]) ||
        l.duration < l.distance / 2.2,
    )
  )
    return null;
  const distance = r.legs.reduce((s, l) => s + l.distance, 0),
    duration = r.legs.reduce((s, l) => s + l.duration, 0);
  if (
    Math.abs(distance - r.distance) > Math.max(5, distance * 0.01) ||
    Math.abs(duration - r.duration) > Math.max(5, duration * 0.01)
  )
    return null;
  return {
    legs: r.legs,
    distance,
    duration,
    checkedAt: now.toISOString(),
    provider: "FOSSGIS / OpenStreetMap",
  };
}
export function osmWalkingProvider(
  beforeRequest: () => Promise<void>,
  request: typeof fetch = fetch,
): WalkingProvider {
  return {
    async check(points) {
      walkingInput.parse({ points });
      await beforeRequest();
      const coords = points
        .map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`)
        .join(";");
      const r = await request(
        `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coords}?overview=false&steps=false&radiuses=${points.map(() => 100).join(";")}`,
        {
          signal: AbortSignal.timeout(6000),
          headers: {
            "User-Agent":
              "Quavi development (https://github.com/david-cui-bruno/quavi)",
          },
        },
      );
      if (r.status === 400) {
        const data = await r.json();
        if (data.code === "NoRoute" || data.code === "NoSegment") return null;
      }
      if (!r.ok)
        throw Object.assign(
          new Error(
            "Walking directions are temporarily unavailable. Try again shortly.",
          ),
          { statusCode: 503 },
        );
      return parseWalkingCheck(await r.json(), points);
    },
  };
}
