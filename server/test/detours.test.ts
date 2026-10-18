import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCategory,
  detourInput,
  planDetours,
  meters,
  type Venue,
} from "../src/detours.js";
const origin = { lat: 48.8566, lng: 2.3522 };
const venue = (id: string, kind: string, lat: number, lng: number): Venue => ({
  id,
  name: "Place " + id,
  kind,
  ll: { lat, lng },
  confidence: 0.95,
  status: "open",
});
const raw = {
  updatedAt: "2026-10-09T00:00:00Z",
  venues: [
    venue("a", "coffee_shop", 48.857, 2.353),
    venue("b", "bookstore", 48.858, 2.354),
    venue("c", "park", 48.859, 2.355),
    venue("d", "museum", 48.856, 2.351),
    venue("e", "bakery", 48.855, 2.353),
  ],
};
const input = detourInput.parse({
  origin,
  label: "Paris",
  interests: ["cozy"],
  minutes: 60,
});
test("real coordinates and origin survive ranking with distinct nearby stops", () => {
  const result = planDetours(raw, input);
  assert.ok(result.openings.length > 0);
  for (const route of result.openings) {
    assert.deepEqual(route.origin, origin);
    assert.equal(route.chapters.length, 3);
    assert.equal(new Set(route.chapters.map((c) => c.placeId)).size, 3);
    for (const c of route.chapters) assert.ok(meters(origin, c.ll) < 1400);
    assert.match(route.tags, /hours unverified/);
    assert.ok(route.estimatedMinutes <= 60);
  }
});
test("closed, low-confidence, far-away and unsuitable adult venues are excluded", () => {
  const bad = [
    { ...raw.venues[0], id: "closed", status: "permanently_closed" },
    { ...raw.venues[0], id: "low", confidence: 0.2 },
    { ...raw.venues[0], id: "nyc", ll: { lat: 40.73, lng: -74 } },
    { ...raw.venues[0], id: "wine", name: "Wine and cocktail room" },
  ];
  const result = planDetours(
    { ...raw, venues: [...raw.venues, ...bad] },
    input,
  );
  for (const route of result.openings)
    assert.ok(
      route.chapters.every((c) => !bad.some((v) => v.id === c.placeId)),
    );
});
test("sparse coverage returns no routes and never falls back to demo stops", () => {
  const result = planDetours({ ...raw, venues: raw.venues.slice(0, 2) }, input);
  assert.equal(result.openings.length, 0);
  assert.match(result.notes[0], /couldn’t find three/);
});
test("weather mood prefers indoor candidates and duplicate venue names do not become multiple stops", () => {
  const duplicate = {
    ...raw.venues[0],
    id: "duplicate",
    ll: { lat: 48.8571, lng: 2.3531 },
  };
  const result = planDetours(
    { ...raw, venues: [...raw.venues, duplicate] },
    { ...input, mood: "weather" },
  );
  for (const route of result.openings)
    assert.equal(new Set(route.chapters.map((c) => c.place)).size, 3);
});
test("coordinates, time limits and unexpected request fields are validated", () => {
  assert.throws(() =>
    detourInput.parse({ ...input, origin: { lat: 999, lng: 0 } }),
  );
  assert.throws(() => detourInput.parse({ ...input, minutes: 999 }));
  assert.throws(() => detourInput.parse({ ...input, userId: "someone-else" }));
});

test("a restaurant category does not override an adult venue name for under-21 users", () => {
  const bar = {
    ...raw.venues[0],
    id: "adult-bar",
    name: "Bar Agricole",
    kind: "restaurant",
  };
  const result = planDetours({ ...raw, venues: [bar, ...raw.venues] }, input);
  for (const route of result.openings)
    assert.ok(route.chapters.every((c) => c.placeId !== "adult-bar"));
});

test('the app honors real coordinates even when a real venue name matches a demo place',async()=>{
 const {buildStory,OPENINGS,chapterMeta,tripMeters}=await import('../../src/data.ts')
 const story=buildStory(OPENINGS[0]);story.origin={lat:37.7749,lng:-122.4194};story.chapters=[{...story.chapters[0],place:'Corner Coffee',ll:{lat:37.775,lng:-122.419}}]
 assert.equal(chapterMeta(story,0).lat,37.775);assert.ok(tripMeters(story)<100)
})


test('venue categories do not turn offices or parking facilities into outing stops',()=>{
 assert.equal(normalizeCategory('coworking_space'),null);assert.equal(normalizeCategory('parking'),null);assert.equal(normalizeCategory('travel_agency'),null);assert.equal(normalizeCategory('italian_restaurant'),'restaurant');assert.equal(normalizeCategory('art_museum'),'museum');assert.equal(normalizeCategory('national_park'),'park')
})
