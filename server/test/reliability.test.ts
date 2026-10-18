import test from "node:test";
import assert from "node:assert/strict";
import {
  assessPlace,
  evaluateHours,
  googlePlace,
  matchPlace,
} from "../src/google-hours.js";
import { checkedDetours } from "../src/checked-detours.js";
import { detourInput, planDetours, type Point } from "../src/detours.js";
import { parseGoogleRoute } from "../src/google-geo.js";
const origin = { lat: 40.73, lng: -74 };
const place = (name = "Corner Café", types = ["cafe"]) => ({
  id: "place",
  displayName: { text: name },
  location: { latitude: origin.lat, longitude: origin.lng },
  businessStatus: "OPERATIONAL",
  primaryType: types[0],
  types,
  currentOpeningHours: { periods: [{ open: { day: 0, hour: 0, minute: 0 } }] },
});
const hours = (p: any) =>
  evaluateHours(
    p,
    origin,
    new Date("2026-10-18T15:00Z"),
    new Date("2026-10-18T15:20Z"),
    new Date("2026-10-18T14:00Z"),
  );
const input = detourInput.parse({
  origin,
  label: "Test",
  interests: ["cozy"],
  minutes: 60,
});
const raw = {
  updatedAt: new Date().toISOString(),
  venues: [
    "coffee_shop",
    "bookstore",
    "park",
    "bakery",
    "arcade",
    "art_gallery",
    "museum",
  ].map((kind, i) => ({
    id: String(i),
    name: "Place " + i,
    kind,
    ll: { lat: origin.lat + 0.0005 + i * 0.0006, lng: origin.lng },
    confidence: 0.99,
    status: "open",
  })),
};
const route = (points: Point[]) => ({
  provider: "Google Maps",
  checkedAt: new Date().toISOString(),
  legs: points.slice(1).map(() => ({ distance: 100, duration: 120 })),
  distance: (points.length - 1) * 100,
  duration: (points.length - 1) * 120,
});

test("catalog-localized aliases work without fuzzy matching or distant/ambiguous identity guesses", () => {
  assert.equal(
    matchPlace([place("東京喫茶店")], "Tokyo Coffee", origin, {
      aliases: ["東京喫茶店"],
    })?.id,
    "place",
  );
  assert.equal(
    matchPlace([place("Other Coffee")], "Corner Café", origin),
    undefined,
  );
  assert.equal(
    matchPlace([place("Corner Cafe Main Street")], "Corner Café", origin),
    undefined,
  );
  assert.equal(
    matchPlace([place("Ｃｏｒｎｅｒ Ｃａｆｅ")], "Corner Café", origin)?.id,
    "place",
  );
  assert.equal(
    matchPlace([place(), { ...place(), id: "other" }], "Corner Café", origin),
    undefined,
  );
  assert.equal(
    matchPlace([place(), place()], "Corner Café", origin)?.id,
    "place",
  );
  assert.equal(
    matchPlace([place()], "Corner Café", { lat: 41, lng: -74 }),
    undefined,
  );
});
test("same-name offices, parking and service-area businesses cannot borrow cafe hours", () => {
  for (const type of ["corporate_office", "parking", "bar"]) {
    const result = assessPlace(
      [place("Corner Café", [type])],
      "Corner Café",
      origin,
      { kind: "Café" },
    );
    assert.equal(hours(result).venueStatus, "unsuitable");
    assert.notEqual(hours(result).status, "open");
  }
  const result = assessPlace(
    [{ ...place(), pureServiceAreaBusiness: true }],
    "Corner Café",
    origin,
    { kind: "Café" },
  );
  assert.equal(hours(result).venueIssue, "service_area");
  assert.equal(
    hours(assessPlace([place()], "Corner Café", origin, { kind: "Café" }))
      .status,
    "open",
  );
  assert.equal(
    hours(
      assessPlace([place("Gallery", ["art_gallery"])], "Gallery", origin, {
        kind: "Museum",
      }),
    ).venueStatus,
    "unsuitable",
  );
  assert.equal(
    hours(
      assessPlace([place("Curry", ["indian_restaurant"])], "Curry", origin, {
        kind: "Restaurant",
      }),
    ).status,
    "open",
  );
});
test("missing categories and unresolved matches stay honest; open hours never claim admission", () => {
  const p = assessPlace(
    [
      {
        ...place(),
        types: [],
        primaryType: undefined,
        websiteUri: "https://example.test/tickets",
      },
    ],
    "Corner Café",
    origin,
    { kind: "Café" },
  );
  assert.equal(hours(p).status, "open");
  assert.equal(hours(p).websiteURL, "https://example.test/tickets");
  assert.equal((hours(p) as any).admissionConfirmed, undefined);
  assert.equal(hours(undefined).venueStatus, "unverified");
  assert.equal(hours(undefined).status, "unknown");
  assert.equal(
    hours(
      assessPlace(
        [{ ...place(), websiteUri: "javascript:alert(1)" }],
        "Corner Café",
        origin,
      ),
    ).websiteURL,
    undefined,
  );
});
test("unwalkable selected stops get bounded alternate combinations, not a straight-line fallback", async () => {
  const selected = planDetours(raw, input).openings[0].chapters[0];
  let calls = 0;
  const check = async (points: Point[]) => {
    calls++;
    return points.some((p) => p.lat === selected.ll.lat) ? null : route(points);
  };
  const result = await checkedDetours(raw, input, { check });
  assert(result.openings.length);
  assert(
    result.openings.every((o) =>
      o.chapters.every((c) => c.placeId !== selected.placeId),
    ),
  );
  assert(calls <= 6);
  let denied = 0;
  const noRoute = await checkedDetours(raw, input, {
    check: async () => {
      denied++;
      return null;
    },
  });
  assert.equal(noRoute.openings.length, 0);
  assert(denied <= 6);
});
test("unsuitable verified venue types trigger replacement and expected kind reaches the provider", async () => {
  const bad = planDetours(raw, input).openings[0].chapters[0].place;
  const contexts: string[] = [];
  const geo = {
    check: async (points: Point[]) => route(points),
    navigate: async () => null,
    place: async (
      name: string,
      ll: Point,
      _id?: string,
      context?: { kind?: string },
    ) => {
      contexts.push(context?.kind ?? "");
      if (name === bad) return { rejected: "service_area" as const };
      return googlePlace.parse({
        ...place(name, []),
        primaryType: undefined,
        location: { latitude: ll.lat, longitude: ll.lng },
      });
    },
  };
  const result = await checkedDetours(raw, input, geo, geo);
  assert(result.openings.length);
  assert(
    result.openings.every((o) => o.chapters.every((c) => c.place !== bad)),
  );
  assert(contexts.every(Boolean));
});
test("a later provider outage preserves only previously checked offers; an initial outage still fails", async () => {
  let calls = 0;
  const check = async (points: Point[]) => {
    if (++calls > 1) throw Error("Provider unavailable");
    return route(points);
  };
  const result = await checkedDetours(raw, input, { check });
  assert.equal(result.openings.length, 1);
  assert(
    result.notes.some((n) => n.includes("additional checks were unavailable")),
  );
  await assert.rejects(
    checkedDetours(raw, input, {
      check: async () => {
        throw Error("Provider unavailable");
      },
    }),
    /Provider unavailable/,
  );
});
test("malformed catalog locations and duplicate accent/punctuation names cannot become distinct stops", () => {
  const duplicates = [
    { ...raw.venues[0], id: "dup1", name: "Café Central" },
    { ...raw.venues[0], id: "dup2", name: "Cafe - Central" },
    { ...raw.venues[0], id: "nan", confidence: NaN },
    { ...raw.venues[0], id: "bad", ll: { lat: 400, lng: -74 } },
  ];
  for (const o of planDetours(
    { ...raw, venues: [...duplicates, ...raw.venues] },
    input,
  ).openings) {
    assert(
      o.chapters.filter((c) => ["dup1", "dup2"].includes(c.placeId)).length <=
        1,
    );
    assert(!o.chapters.some((c) => ["nan", "bad"].includes(c.placeId)));
  }
});
test("disconnected or remote step artwork is rejected even when summary waypoints are correct", () => {
  const points = [origin, { lat: 40.731, lng: -74 }];
  const step = (coords: number[][]) => ({
    distanceMeters: 140,
    staticDuration: "140s",
    polyline: { geoJsonLinestring: { coordinates: coords } },
  });
  const build = (steps: any[]) => ({
    routes: [
      {
        distanceMeters: 140,
        duration: "140s",
        polyline: {
          geoJsonLinestring: {
            coordinates: [
              [-74, 40.73],
              [-74, 40.731],
            ],
          },
        },
        legs: [
          {
            distanceMeters: 140,
            duration: "140s",
            startLocation: { latLng: { latitude: 40.73, longitude: -74 } },
            endLocation: { latLng: { latitude: 40.731, longitude: -74 } },
            steps,
          },
        ],
      },
    ],
  });
  assert(
    parseGoogleRoute(
      build([
        step([
          [-74, 40.73],
          [-74, 40.731],
        ]),
      ]),
      points,
    ),
  );
  assert.equal(
    parseGoogleRoute(
      build([
        step([
          [-75, 41],
          [-74, 40.731],
        ]),
      ]),
      points,
    ),
    null,
  );
  assert.equal(
    parseGoogleRoute(
      build([
        step([
          [-74, 40.73],
          [-75, 41],
          [-74, 40.731],
        ]),
      ]),
      points,
    ),
    null,
  );
  assert.equal(
    parseGoogleRoute(
      build([
        step([
          [-74, 40.73],
          [-74, 40.7302],
        ]),
        step([
          [-74, 40.731],
          [-74, 40.731],
        ]),
      ]),
      points,
    ),
    null,
  );
});

test("dated holiday hours and truncated schedules cannot be overridden by optimistic next-change timestamps", () => {
  const base = googlePlace.parse(place());
  const dated = {
    ...base,
    currentOpeningHours: {
      openNow: true,
      nextCloseTime: "2026-10-19T01:00:00Z",
      periods: [
        {
          open: {
            day: 0,
            hour: 10,
            minute: 0,
            date: { year: 2026, month: 10, day: 18 },
          },
          close: {
            day: 0,
            hour: 11,
            minute: 0,
            date: { year: 2026, month: 10, day: 18 },
          },
        },
      ],
    },
  };
  assert.equal(hours(dated).status, "closed");
  const truncated = {
    ...dated,
    currentOpeningHours: {
      ...dated.currentOpeningHours,
      periods: [
        {
          ...dated.currentOpeningHours.periods[0],
          open: {
            ...dated.currentOpeningHours.periods[0].open,
            truncated: true,
          },
        },
      ],
    },
  };
  assert.equal(hours(truncated).status, "unknown");
  const always = {
    ...base,
    currentOpeningHours: {
      openNow: true,
      nextCloseTime: "2026-10-18T15:10:00Z",
      periods: [{ open: { day: 0, hour: 0, minute: 0 } }],
    },
  };
  assert.equal(hours(always).status, "closed");
});
test("the shipped caption caller uses personal notes on real outings and retention removes live venue facts", async () => {
  const { buildStory, OPENINGS, draftCaptions } =
    await import("../../src/data.ts");
  const story = buildStory(OPENINGS[0]);
  story.chapters = [{ ...story.chapters[0], ll: origin, kind: "Café" }];
  story.arrivedStops = [0];
  story.taskNotes = { "0:order": "I tried cardamom tea." };
  assert.match(draftCaptions(story, "Funny")[0], /I tried cardamom tea/);
  const value = {
    ...story,
    chapters: [
      {
        ...story.chapters[0],
        aliases: ["喫茶店"],
        googleRoute: true,
        hours: {
          venueStatus: "matched",
          websiteURL: "https://example.test/tickets",
          status: "open",
        },
      },
    ],
  };
  const server = await import("../src/google-retention.js"),
    client = await import("../../src/google-retention.mjs");
  const safe = server.scrubGoogleContent(value);
  assert(!JSON.stringify(safe).includes("example.test"));
  assert(!JSON.stringify(safe).includes("venueStatus"));
  assert.deepEqual(safe.chapters[0].aliases, ["喫茶店"]);
  assert.deepEqual(client.scrubGoogleContent(value), safe);
});
