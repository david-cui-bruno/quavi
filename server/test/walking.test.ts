import test from "node:test";
import assert from "node:assert/strict";
import {
  parseWalkingCheck,
  walkingInput,
  osmWalkingProvider,
} from "../src/walking.js";
import { checkedDetours } from "../src/checked-detours.js";
import { detourInput, type VenueResult } from "../src/detours.js";
const points = [
  { lat: 40.73, lng: -74 },
  { lat: 40.731, lng: -74.001 },
];
const sample = () => ({
  code: "Ok",
  waypoints: points.map((p) => ({ distance: 5, location: [p.lng, p.lat] })),
  routes: [
    { distance: 180, duration: 150, legs: [{ distance: 180, duration: 150 }] },
  ],
});
test("pedestrian checks retain connected legs and totals", () => {
  const r = parseWalkingCheck(sample(), points, new Date("2026-10-18T12:00Z"));
  assert.equal(r?.distance, 180);
  assert.equal(r?.checkedAt, "2026-10-18T12:00:00.000Z");
});
test("no route, remote snaps, missing legs, impossible speeds and inconsistent metrics fail closed", () => {
  const mutations: ((s: ReturnType<typeof sample>) => void)[] = [
    (s) => {
      s.code = "NoRoute";
    },
    (s) => {
      s.waypoints[1].distance = 101;
    },
    (s) => {
      s.waypoints[1].location = [0, 0];
    },
    (s) => {
      s.routes[0].legs = [];
    },
    (s) => {
      s.routes[0].legs[0].duration = 1;
    },
    (s) => {
      s.routes[0].distance = 900;
    },
    (s) => {
      s.routes[0].legs[0].distance = -1;
    },
  ];
  for (const mutate of mutations) {
    const s = sample();
    mutate(s);
    assert.equal(parseWalkingCheck(s, points), null);
  }
});
test("request bounds reject distant stops, extra input and too many points", () => {
  assert.throws(() =>
    walkingInput.parse({ points: [points[0], { lat: 0, lng: 0 }] }),
  );
  assert.throws(() => walkingInput.parse({ points, userId: "other" }));
  assert.throws(() => walkingInput.parse({ points: Array(5).fill(points[0]) }));
});
test("adapter uses foot graph, bounded snapping and admission before fetching", async () => {
  let admitted = false;
  const p = osmWalkingProvider(
    async () => {
      admitted = true;
    },
    async (url, options) => {
      assert.ok(admitted);
      assert.match(String(url), /routed-foot\/route\/v1\/foot/);
      assert.match(String(url), /radiuses=100;100/);
      assert.ok(options?.signal);
      return new Response(JSON.stringify(sample()));
    },
  );
  assert.equal((await p.check(points))?.duration, 150);
});
const input = detourInput.parse({
  origin: points[0],
  label: "Test",
  interests: ["cozy"],
  minutes: 30,
});
const raw: VenueResult = {
  updatedAt: "2026-10-09T00:00:00Z",
  venues: ["coffee_shop", "bookstore", "park", "bakery"].map((kind, i) => ({
    id: String(i),
    name: "Test place " + i,
    kind,
    ll: { lat: 40.7305 + i * 0.0005, lng: -74 },
    confidence: 0.99,
    status: "open",
  })),
};
test("openings use network times and reject excessive walking or disconnected routes", async () => {
  const check = async () => ({
    distance: 600,
    duration: 720,
    legs: Array(3).fill({ distance: 200, duration: 240 }),
    checkedAt: new Date().toISOString(),
    provider: "test",
  });
  const good = await checkedDetours(raw, input, { check });
  assert.ok(good.openings.length);
  assert.equal(good.openings[0].estimatedMinutes, 30);
  assert.equal(good.openings[0].chapters[0].walk, "4 min walk");
  const bad = await checkedDetours(raw, input, {
    check: async () => ({ ...(await check()), duration: 1200 }),
  });
  assert.equal(bad.openings.length, 0);
  const missing = await checkedDetours(raw, input, { check: async () => null });
  assert.equal(missing.openings.length, 0);
  assert.match(missing.notes[0], /No three-stop outing/);
});
test("provider outages never become a straight-line route", async () => {
  await assert.rejects(
    checkedDetours(raw, input, {
      check: async () => {
        throw new Error("down");
      },
    }),
    /down/,
  );
});
