import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { createPool } from "../src/db.js";
import { readConfig } from "../src/config.js";
import { createApp } from "../src/app.js";
import { ownerHash } from "../src/account.js";
import { assessPlace } from "../src/google-hours.js";
import type { Point } from "../src/detours.js";
const config = readConfig();
if (
  config.GOOGLE_CLOUD_PROJECT !== "demo-quavi" ||
  config.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099"
)
  throw Error("Local emulator only");
const firebase = initializeApp(
    { projectId: "demo-quavi" },
    "reliability-" + randomUUID(),
  ),
  auth = getAuth(firebase),
  pool = createPool(config.DATABASE_URL);
let uid = "",
  token = "",
  unsuitable = true;
const route = (points: Point[]) => ({
  provider: "Google Maps",
  checkedAt: new Date().toISOString(),
  legs: points.slice(1).map(() => ({ distance: 100, duration: 120 })),
  distance: 100 * (points.length - 1),
  duration: 120 * (points.length - 1),
  geometry: points,
  steps: [],
  warnings: [],
});
const app = await createApp({
  pool,
  auth,
  origins: [],
  liveGeo: {
    photo:async(name)=>({url:'https://lh3.googleusercontent.com/photo',placeName:name,mapsUrl:'https://www.google.com/maps/?photo=1',authors:[{name:'Venue owner',url:'https://www.google.com/maps/contrib/1'}]}),
    check: async (points) => route(points),
    navigate: async (points) => route(points),
    place: async (name, ll, _id, context) =>
      assessPlace(
        [
          {
            id: "qa-place",
            displayName: { text: name },
            location: { latitude: ll.lat, longitude: ll.lng },
            businessStatus: "OPERATIONAL",
            primaryType: unsuitable ? "corporate_office" : "cafe",
            types: [unsuitable ? "corporate_office" : "cafe"],
            currentOpeningHours: {
              periods: [{ open: { day: 0, hour: 0, minute: 0 } }],
            },
          },
        ],
        name,
        ll,
        context,
      ),
  },
});
before(async () => {
  const r = await fetch(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=local",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "reliability-" + randomUUID() + "@example.test",
        password: "local-password-123",
        returnSecureToken: true,
      }),
    },
  );
  assert.equal(r.status, 200);
  const u = (await r.json()) as any;
  uid = u.localId;
  token = u.idToken;
});
after(async () => {
  await app.close();
  if (uid) {
    await pool.query("DELETE FROM request_quotas WHERE owner_hash=$1", [
      ownerHash(uid),
    ]);
    await auth.deleteUser(uid);
  }
  await pool.end();
  await deleteApp(firebase);
});
test("start/resume checks reject unsuitable stops and validate category/alias input through the authenticated endpoint", async () => {
  const body = {
    points: [
      { lat: 40.73, lng: -74 },
      { lat: 40.731, lng: -74 },
    ],
    stops: [
      {
        name: "Test café",
        ll: { lat: 40.731, lng: -74 },
        mins: 10,
        kind: "Café",
        aliases: ["喫茶店"],
      },
    ],
  };
  const call = (payload: unknown) =>
    app.inject({
      method: "POST",
      url: "/v1/me/detour-check",
      headers: { authorization: "Bearer " + token },
      payload,
    });
  const denied = await call(body);
  assert.equal(denied.statusCode, 422, denied.body);
  assert.match(denied.json().error, /replacement/);
  unsuitable = false;
  const good = await call(body);
  assert.equal(good.statusCode, 200, good.body);
  assert.equal(good.json().hours[0].venueStatus, "matched");
  assert.equal(good.json().hours[0].status, "unknown");
  assert.equal(
    (
      await call({
        ...body,
        stops: [{ ...body.stops[0], aliases: Array(9).fill("Name") }],
      })
    ).statusCode,
    400,
  );
});

test('venue photos require an authenticated bounded identity request and never enable URL proxying',async()=>{
 const payload={name:'Test café',ll:{lat:40.731,lng:-74},kind:'Café'};
 const call=(body:unknown,authorized=true)=>app.inject({method:'POST',url:'/v1/me/venue-photo',headers:authorized?{authorization:'Bearer '+token}:{},payload:body});
 assert.equal((await call(payload,false)).statusCode,401);
 assert.equal((await call({...payload,url:'http://127.0.0.1/private'})).statusCode,400);
 const r=await call(payload);assert.equal(r.statusCode,200,r.body);assert.equal(r.headers['cache-control'],'no-store');assert.equal(r.json().photo.placeName,payload.name);assert.equal(r.json().photo.authors[0].name,'Venue owner');
});
