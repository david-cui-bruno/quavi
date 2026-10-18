import { GoogleAuth } from "google-auth-library";
import type pg from "pg";
import { z } from "zod";
import { meters, type Point } from "./detours.js";
import {
  walkingInput,
  type WalkingProvider,
  type WalkingCheck,
} from "./walking.js";
import { matchPlace, googlePlace, type GooglePlace } from "./google-hours.js";
export const WALKING_WARNING =
  "Walking directions may be missing sidewalks or pedestrian paths. Check local signs and conditions.";
export type GoogleNavigation = WalkingCheck & {
  geometry: Point[];
  steps: {
    maneuver: { type: string; modifier?: string; instruction?: string };
    name: string;
    distance: number;
    duration: number;
    start: number;
  }[];
  warnings: string[];
};
export interface LiveGeo extends WalkingProvider {
  place(name: string, ll: Point, id?: string): Promise<GooglePlace | undefined>;
  navigate(points: Point[]): Promise<GoogleNavigation | null>;
}
const latLng = z.object({
  latitude: z.number().min(-85).max(85),
  longitude: z.number().min(-180).max(180),
});
const seconds = z
  .string()
  .regex(/^\d+(\.\d+)?s$/)
  .transform((s) => Number(s.slice(0, -1)));
const line = z.object({
  geoJsonLinestring: z.object({
    coordinates: z
      .array(
        z.tuple([z.number().min(-180).max(180), z.number().min(-85).max(85)]),
      )
      .min(2)
      .max(20000),
  }),
});
const routeSchema = z.object({
  routes: z
    .array(
      z.object({
        distanceMeters: z.number().nonnegative(),
        duration: seconds,
        warnings: z.array(z.string().max(2000)).default([]),
        polyline: line,
        legs: z.array(
          z.object({
            distanceMeters: z.number().nonnegative().default(0),
            duration: seconds,
            startLocation: z.object({ latLng }),
            endLocation: z.object({ latLng }),
            steps: z
              .array(
                z.object({
                  distanceMeters: z.number().nonnegative().default(0),
                  staticDuration: seconds,
                  polyline: line,
                  navigationInstruction: z
                    .object({
                      maneuver: z.string().optional(),
                      instructions: z.string().max(2000).optional(),
                    })
                    .optional(),
                }),
              )
              .default([]),
          }),
        ),
      }),
    )
    .max(1)
    .default([]),
});
export function parseGoogleRoute(
  raw: unknown,
  points: Point[],
  now = new Date(),
): GoogleNavigation | null {
  const d = routeSchema.safeParse(raw);
  if (!d.success || !d.data.routes.length) return null;
  const r = d.data.routes[0];
  const ll = (p: z.infer<typeof latLng>) => ({
    lat: p.latitude,
    lng: p.longitude,
  });
  if (
    r.legs.length !== points.length - 1 ||
    r.legs.some(
      (l, i) =>
        meters(points[i], ll(l.startLocation.latLng)) > 100 ||
        meters(points[i + 1], ll(l.endLocation.latLng)) > 100 ||
        l.distanceMeters > 4000 ||
        l.duration > 3600 ||
        l.duration < l.distanceMeters / 2.2,
    )
  )
    return null;
  const geometry: Point[] = [],
    steps: GoogleNavigation["steps"] = [];
  for (const leg of r.legs)
    for (const step of leg.steps) {
      const start = geometry.length ? geometry.length - 1 : 0;
      step.polyline.geoJsonLinestring.coordinates.forEach(([lng, lat], i) => {
        if (i === 0 && geometry.length) return;
        geometry.push({ lat, lng });
      });
      const m = step.navigationInstruction?.maneuver ?? "STRAIGHT";
      steps.push({
        maneuver: {
          type:
            m === "DEPART"
              ? "depart"
              : m === "ARRIVE"
                ? "arrive"
                : m.startsWith("TURN")
                  ? "turn"
                  : "continue",
          modifier: m.includes("LEFT")
            ? "left"
            : m.includes("RIGHT")
              ? "right"
              : "straight",
          instruction: step.navigationInstruction?.instructions,
        },
        name: "",
        distance: step.distanceMeters,
        duration: step.staticDuration,
        start,
      });
    }
  if (geometry.length < 2 || !steps.length) return null;
  const duration = r.legs.reduce((a, l) => a + l.duration, 0),
    distance = r.legs.reduce((a, l) => a + l.distanceMeters, 0);
  if (
    Math.abs(duration - r.duration) > Math.max(5, duration * 0.01) ||
    Math.abs(distance - r.distanceMeters) > Math.max(5, distance * 0.01)
  )
    return null;
  return {
    provider: "Google Maps",
    checkedAt: now.toISOString(),
    duration,
    distance,
    legs: r.legs.map((l) => ({
      distance: l.distanceMeters,
      duration: l.duration,
    })),
    geometry,
    steps,
    warnings: [WALKING_WARNING, ...r.warnings],
  };
}
export function googleGeo(projectId: string, pool: pg.Pool): LiveGeo {
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const request = async (
    url: string,
    body: unknown,
    mask: string,
    kind: "places" | "routes",
  ) => {
    // Calendar-month caps include failed attempts, shared by every API instance. No paid-service retry loop.
    const {
      rows: [q],
    } = await pool.query(
      `INSERT INTO request_quotas(owner_hash,category,window_at,used) VALUES('project',$1,date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',1) ON CONFLICT(owner_hash,category,window_at) DO UPDATE SET used=request_quotas.used+1 RETURNING used`,
      ["google-" + kind],
    );
    if (q.used > 500)
      throw Object.assign(new Error("Monthly map lookup cap reached"), {
        statusCode: 429,
      });
    try {
    const token = await auth.getAccessToken();
    const r = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: "Bearer " + token,
        "X-Goog-User-Project": projectId,
        "X-Goog-FieldMask": mask,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok)
      throw Object.assign(new Error("Google map lookup unavailable"), {
        statusCode: 503,
      });
    return await r.json();
    } catch {
      // Credential/provider transport details must not enter application logs.
      throw Object.assign(new Error('Google map lookup unavailable'),{statusCode:503});
    }
  };
  const navigate = async (points: Point[]) => {
    walkingInput.parse({ points });
    const waypoint = (p: Point) => ({
      location: { latLng: { latitude: p.lat, longitude: p.lng } },
    });
    const data = await request(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        origin: waypoint(points[0]),
        destination: waypoint(points.at(-1)!),
        intermediates: points.slice(1, -1).map(waypoint),
        travelMode: "WALK",
        languageCode: "en",
        polylineEncoding: "GEO_JSON_LINESTRING",
      },
      "routes.distanceMeters,routes.duration,routes.warnings,routes.polyline,routes.legs.distanceMeters,routes.legs.duration,routes.legs.startLocation,routes.legs.endLocation,routes.legs.steps.distanceMeters,routes.legs.steps.staticDuration,routes.legs.steps.polyline,routes.legs.steps.navigationInstruction",
      "routes",
    );
    return parseGoogleRoute(data, points);
  };
  const fields =
    "id,displayName,location,businessStatus,currentOpeningHours,attributions,googleMapsUri";
  return {
    navigate,
    async check(points) {
      const r = await navigate(points);
      if (!r) return null;
      const { legs, duration, distance, provider, checkedAt } = r;
      return { legs, duration, distance, provider, checkedAt };
    },
    async place(name, ll, id) {
      if (id) {
        const raw = await request(
          "https://places.googleapis.com/v1/places/" + encodeURIComponent(id),
          undefined,
          fields,
          "places",
        );
        const parsed = googlePlace.safeParse(raw);
        if (parsed.success) return matchPlace([parsed.data], name, ll);
        return undefined;
      }
      const raw = await request(
        "https://places.googleapis.com/v1/places:searchText",
        {
          textQuery: name,
          locationBias: {
            circle: {
              center: { latitude: ll.lat, longitude: ll.lng },
              radius: 150,
            },
          },
          maxResultCount: 3,
          languageCode: "en",
        },
        fields
          .split(",")
          .map((s) => "places." + s)
          .join(","),
        "places",
      );
      return matchPlace(raw.places ?? [], name, ll);
    },
  };
}
