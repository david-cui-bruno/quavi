import {normalizePlaceName} from './place-identity.js';
import { z } from "zod";
export type Point = { lat: number; lng: number };
export type Venue = {
  id: string;
  name: string;
  aliases?:string[];
  kind: string;
  ll: Point;
  locality?: string;
  confidence: number;
  status: string;
  website?: string;
};
export type VenueResult = { venues: Venue[]; updatedAt: string };
export interface VenueProvider {
  nearby(origin: Point): Promise<VenueResult>;
}
export const detourInput = z
  .object({
    origin: z
      .object({
        lat: z.number().min(-85).max(85),
        lng: z.number().min(-180).max(180),
      })
      .strict(),
    label: z.string().trim().min(1).max(120),
    interests: z
      .array(z.enum(["food", "cozy", "art", "air", "fun", "gems"]))
      .max(6),
    mood: z.enum(["bailed", "closed", "mood", "weather", "late"]).optional(),
    minutes: z
      .union([z.literal(30), z.literal(60), z.literal(120)])
      .default(60),
    age21: z.boolean().optional(),
  })
  .strict();
export const kinds: Record<string, { label: string; interest: string }> = {
  coffee_shop: { label: "Café", interest: "cozy" },
  cafe: { label: "Café", interest: "cozy" },
  restaurant: { label: "Restaurant", interest: "food" },
  bookstore: { label: "Bookshop", interest: "cozy" },
  park: { label: "Park", interest: "air" },
  art_gallery: { label: "Art gallery", interest: "art" },
  museum: { label: "Museum", interest: "art" },
  bakery: { label: "Bakery", interest: "food" },
  ice_cream_shop: { label: "Ice cream shop", interest: "food" },
  arcade: { label: "Arcade", interest: "fun" },
  botanical_garden: { label: "Garden", interest: "air" },
};
export function normalizeCategory(primary:string): string|null {
  if(kinds[primary])return primary
  if(/^[a-z_]+_restaurant$/.test(primary))return 'restaurant'
  if(/^[a-z_]+_museum$/.test(primary))return 'museum'
  if(/^(national|state|regional|city|urban)_park$/.test(primary))return 'park'
  return null
}
export function meters(a: Point, b: Point) {
  const rad = (n: number) => (n * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) *
      Math.cos(rad(b.lat)) *
      Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** Pure ranking: no invented stops, fixed-city coordinates, opening-hour or price claims. */
export function planDetours(
  raw: VenueResult,
  input: z.infer<typeof detourInput>,
) {
  const radius =
    input.minutes === 30 ? 650 : input.minutes === 60 ? 1400 : 2000;
  const names = new Set<string>(),
    ids = new Set<string>();
  const venues = raw.venues.filter((v) => {
    if (
      !kinds[v.kind] ||
      !["open", "unknown"].includes(v.status) ||
      !Number.isFinite(v.confidence) || v.confidence < 0.8 ||
      Math.abs(v.ll.lat)>85 || Math.abs(v.ll.lng)>180 ||
      !Number.isFinite(v.ll.lat) ||
      !Number.isFinite(v.ll.lng) ||
      meters(input.origin, v.ll) > radius
    )
      return false;
    if (
      input.age21 !== true &&
      /\b(wine|bar|pub|cocktail|nightclub|casino|speakeasy)\b/i.test(v.name)
    )
      return false;
    const name = v.name.trim().toLocaleLowerCase();
    const identityName=normalizePlaceName(name);
    if(!identityName)return false;
    if (/\b(coworking|co-working|office space|parking|headquarters|navigator|dba)\b/i.test(v.name)) return false;
    if (
      [
        "cafe",
        "café",
        "restaurant",
        "park",
        "museum",
        "bookstore",
        "coffee shop",
        "bakery",
        "gallery",
      ].includes(name)
    )
      return false;
    if (ids.has(v.id) || names.has(identityName)) return false;
    ids.add(v.id);
    names.add(identityName);
    return true;
  });
  const themes = [
    {
      id: "cozy",
      title: "The nearby escape",
      interest: "cozy",
      persona: "Luna",
      color: "Orange",
      bg: "paper",
    },
    {
      id: "lucky",
      title: "The local find",
      interest: "art",
      persona: "Juno",
      color: "Yellow",
      bg: "orange",
    },
    {
      id: "bold",
      title: "The wandering chapter",
      interest: "air",
      persona: "Rex",
      color: "Yellow",
      bg: "ink",
    },
  ] as const;
  const routes = new Set<string>();
  const openings = themes.flatMap((theme) => {
    let prev = input.origin,
      totalWalk = 0;
    const chosen: Venue[] = [];
    for (let i = 0; i < 3; i++) {
      const candidates = venues.filter(
        (v) =>
          !chosen.includes(v) && !chosen.some((c) => meters(c.ll, v.ll) < 40),
      );
      candidates.sort((a, b) => {
        const score = (v: Venue) => {
          const interest = kinds[v.kind].interest;
          return (
            meters(prev, v.ll) / 140 +
            (chosen.some((c) => kinds[c.kind].label === kinds[v.kind].label)
              ? 12
              : 0) -
            (interest === theme.interest ? 4 : 0) -
            (input.interests.includes(
              interest as (typeof input.interests)[number],
            )
              ? 2
              : 0) +
            (input.mood === "weather" && interest === "air" ? 6 : 0)
          );
        };
        return score(a) - score(b) || a.id.localeCompare(b.id);
      });
      const next = candidates.find(
        (v) =>
          meters(prev, v.ll) <= Math.min(1300, radius) &&
          totalWalk + Math.ceil((meters(prev, v.ll) * 1.35) / 75) + 3 * 5 <=
            input.minutes,
      );
      if (!next) break;
      totalWalk += Math.max(1, Math.ceil((meters(prev, next.ll) * 1.35) / 75));
      chosen.push(next);
      prev = next.ll;
    }
    if (chosen.length < 3) return [];
    const key = chosen.map((v) => v.id).join("|");
    if (routes.has(key)) return [];
    routes.add(key);
    let from = input.origin;
    const stay = Math.max(
      5,
      Math.min(20, Math.floor((input.minutes - totalWalk) / 3)),
    );
    const chapters = chosen.map((v, i) => {
      const walk = Math.max(1, Math.ceil((meters(from, v.ll) * 1.35) / 75));
      from = v.ll;
      return {
        title: v.name,
        place: v.name,
        meta: `${kinds[v.kind].label} · hours unverified`,
        mins: stay,
        desc: `A ${kinds[v.kind].label.toLowerCase()} near ${input.label}. Check opening hours, access and prices before heading over.`,
        walk: `Approx. ${walk} min walk`,
        persona: ["Pip", "Juno", "Maple"][i],
        color: "Orange",
        at: [24 + i * 27, 74 - i * 22],
        ll: v.ll,
        kind: kinds[v.kind].label,
        placeId: v.id,
        aliases:v.aliases?.slice(0,8),
        alts: [],
      };
    });
    return [
      {
        id: `city-${theme.id}`,
        title: theme.title,
        tags: `Nearby · approx. ${totalWalk + stay * 3} min · hours unverified`,
        route: chosen.map((v) => v.name).join(" → "),
        premise: `Three nearby stops around ${input.label}, picked from real map data.`,
        bg: theme.bg,
        persona: theme.persona,
        color: theme.color,
        chapters,
        estimatedMinutes: totalWalk + stay * 3,
        origin: input.origin,
        source: {
          provider: "Overture Maps",
          updatedAt: raw.updatedAt,
          attributionURL: "https://docs.overturemaps.org/attribution/",
        },
      },
    ];
  });
  return {
    openings,
    notes: openings.length
      ? [
          "Opening hours, admission and prices are unverified. Walking times are estimates; check the street route before starting.",
        ]
      : [
          "We couldn’t find three suitable nearby stops within your time limit. Try another area or allow more time.",
        ],
    provider: "Overture Maps",
    updatedAt: raw.updatedAt,
  };
}
