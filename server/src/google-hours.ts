import {
  normalizePlaceName,
  categoryIssue,
  type PlaceIdentity,
  type PlaceRejection,
} from "./place-identity.js";
import { Temporal } from "@js-temporal/polyfill";
import tzLookup from "tz-lookup";
import { z } from "zod";
import { meters, type Point } from "./detours.js";
export type HoursCheck = {
  status: "open" | "closed" | "unknown";
  checkedAt: string;
  arrivalAt: string;
  leaveAt: string;
  venueStatus?: "matched" | "unverified" | "unsuitable";
  venueIssue?: "category_mismatch" | "service_area";
  websiteURL?: string;
  googlePlaceId?: string;
  mapsURL?: string;
  attributions: { displayName: string; uri?: string }[];
};
const moment = z.object({
  day: z.number().int().min(0).max(6),
  hour: z.number().int().min(0).max(23).default(0),
  minute: z.number().int().min(0).max(59).default(0),
  date: z
    .object({
      year: z.number().int(),
      month: z.number().int().min(1).max(12),
      day: z.number().int().min(1).max(31),
    })
    .optional(),
  truncated: z.boolean().optional(),
});
export const googlePlace = z.object({
  id: z.string().max(300),
  displayName: z.object({ text: z.string().max(300) }),
  location: z.object({
    latitude: z.number().min(-85).max(85),
    longitude: z.number().min(-180).max(180),
  }),
  businessStatus: z.string().optional(),
  primaryType: z.string().max(100).optional(),
  types: z.array(z.string().max(100)).max(100).default([]),
  pureServiceAreaBusiness: z.boolean().optional(),
  websiteUri: z.string().max(2048).optional(),
  googleMapsUri: z
    .string()
    .url()
    .refine((v) => v.startsWith("https://"))
    .optional(),
  attributions: z
    .array(
      z.object({
        provider: z.string().optional(),
        providerUri: z.string().url().optional(),
      }),
    )
    .default([]),
  currentOpeningHours: z
    .object({
      openNow: z.boolean().optional(),
      nextCloseTime: z.string().datetime().optional(),
      nextOpenTime: z.string().datetime().optional(),
      periods: z
        .array(z.object({ open: moment, close: moment.optional() }))
        .max(100)
        .optional(),
    })
    .optional(),
});
export type GooglePlace = z.infer<typeof googlePlace>;
/** A biased search is not an identity match. Never attach a nearby business's hours to another venue. */
export function matchPlace(
  raw: unknown[],
  name: string,
  ll: Point,
  context: PlaceIdentity = {},
): GooglePlace | undefined {
  const matches = raw.flatMap((p) => {
    const r = googlePlace.safeParse(p);
    return r.success &&
      [name, ...(context.aliases ?? [])].some(
        (n) =>
          normalizePlaceName(n) === normalizePlaceName(r.data.displayName.text),
      ) &&
      meters(ll, {
        lat: r.data.location.latitude,
        lng: r.data.location.longitude,
      }) <= 80
      ? [r.data]
      : [];
  });
  const unique = [...new Map(matches.map((p) => [p.id, p])).values()];
  return unique.length === 1 ? unique[0] : undefined;
}
export function assessPlace(
  raw: unknown[],
  name: string,
  ll: Point,
  context: PlaceIdentity = {},
): GooglePlace | PlaceRejection | undefined {
  const place = matchPlace(raw, name, ll, context);
  if (!place) return;
  if (place.pureServiceAreaBusiness) return { rejected: "service_area" };
  return categoryIssue(place.types, place.primaryType, context.kind) ?? place;
}
export function evaluateHours(
  place: GooglePlace | PlaceRejection | undefined,
  ll: Point,
  arrival: Date,
  leave: Date,
  checked = new Date(),
): HoursCheck {
  const out: HoursCheck = {
    status: "unknown",
    checkedAt: checked.toISOString(),
    arrivalAt: arrival.toISOString(),
    leaveAt: leave.toISOString(),
    attributions: [],
    venueStatus: "unverified",
  };
  if (!place) return out;
  if ("rejected" in place) {
    out.venueStatus = "unsuitable";
    out.venueIssue = place.rejected;
    return out;
  }
  out.venueStatus = "matched";
  if (place.websiteUri?.startsWith("https://")) {
    try {
      const url = new URL(place.websiteUri);
      if (url.protocol === "https:" && !url.username && !url.password)
        out.websiteURL = url.href;
    } catch {}
  }
  out.googlePlaceId = place.id;
  out.mapsURL = place.googleMapsUri;
  out.attributions = place.attributions.map((a) => ({
    displayName: a.provider ?? "Data provider",
    uri: a.providerUri,
  }));
  if (
    place.businessStatus === "CLOSED_PERMANENTLY" ||
    place.businessStatus === "CLOSED_TEMPORARILY"
  ) {
    out.status = "closed";
    return out;
  }
  if (
    place.businessStatus !== "OPERATIONAL" ||
    arrival < checked ||
    leave <= arrival ||
    arrival.getTime() - checked.getTime() > 6 * 86400000
  )
    return out;
  const hours = place.currentOpeningHours;
  if (!hours) return out;
  const datedOrTruncated = hours.periods?.some(
    (p) =>
      p.open.date || p.close?.date || p.open.truncated || p.close?.truncated,
  );
  if (
    !datedOrTruncated &&
    hours.openNow === true &&
    hours.nextCloseTime &&
    leave.getTime() <= Date.parse(hours.nextCloseTime)
  ) {
    out.status = "open";
    return out;
  }
  if (
    !datedOrTruncated &&
    hours.openNow === false &&
    hours.nextOpenTime &&
    leave.getTime() <= Date.parse(hours.nextOpenTime)
  ) {
    out.status = "closed";
    return out;
  }
  const periods = hours.periods;
  if (!periods?.length) return out;
  try {
    const tz = tzLookup(ll.lat, ll.lng);
    const stamp = (p: z.infer<typeof moment>) => {
      if (!p.date) throw Error("Undated hours");
      return Temporal.ZonedDateTime.from(
        { ...p.date, hour: p.hour, minute: p.minute, timeZone: tz },
        { disambiguation: "reject", overflow: "reject" },
      ).epochMilliseconds;
    };
    const always =
      periods.length === 1 &&
      periods[0].open.day === 0 &&
      periods[0].open.hour === 0 &&
      periods[0].open.minute === 0 &&
      !periods[0].close &&
      !periods[0].open.date &&
      !periods[0].open.truncated;
    if (always) {
      const nextClose = Date.parse(hours.nextCloseTime ?? "");
      if (
        hours.openNow === true &&
        Number.isFinite(nextClose) &&
        arrival.getTime() < nextClose &&
        leave.getTime() > nextClose
      ) {
        out.status = "closed";
        return out;
      }
      out.status = "open";
      return out;
    }
    const intervals = periods.map((p) => {
      if (!p.close || p.open.truncated || p.close.truncated)
        throw Error("Incomplete interval");
      const a = stamp(p.open),
        b = stamp(p.close);
      if (b <= a) throw Error("Invalid period");
      return [a, b];
    });
    out.status = intervals.some(
      ([a, b]) => a <= arrival.getTime() && b >= leave.getTime(),
    )
      ? "open"
      : "closed";
  } catch {
    /* Missing, ambiguous DST and truncated schedules stay unknown. */
  }
  return out;
}
