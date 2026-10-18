import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { createApp } from "../src/app.js";
import { ownerHash, processDeletions } from "../src/account.js";
import { createPool } from "../src/db.js";
import { readConfig } from "../src/config.js";

const config = readConfig();
if (
  config.GOOGLE_CLOUD_PROJECT !== "demo-quavi" ||
  config.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099"
) {
  throw new Error(
    "Integration tests only run against the local demo-quavi auth emulator",
  );
}
const firebase = initializeApp(
  { projectId: config.GOOGLE_CLOUD_PROJECT },
  `test-${randomUUID()}`,
);
const auth = getAuth(firebase);
const pool = createPool(config.DATABASE_URL);
const state = (name: string) => ({
  user: {
    name,
    avatar: { color: "Yellow" },
    interests: [],
    neighborhood: "Test",
    authed: true,
  },
  friends: [],
  demoRedemptions: [],
  chapter: 0,
  shelf: [],
  lists: {},
  library: {},
  game: {
    xp: 0,
    coins: 0,
    streak: 0,
    badges: [],
    done: {},
    collected: {},
    tripXp: {},
  },
});
let removalFails = false;
const removed: string[] = [];
const mediaAdapter = {
  async upload(key: string, contentType: string, bytes: number) {
    return {
      url: "https://storage.test/upload",
      fields: { key, "Content-Type": contentType, bytes: String(bytes) },
    };
  },
  async read(key: string) {
    return `https://storage.test/read/${key}`;
  },
  async verify(_key: string, _contentType: string, bytes: number | null) {
    return bytes || 1024;
  },
  async finalize(key: string, _contentType: string, bytes: number | null) {
    return { key: key.replace(/^pending\//, "users/"), bytes: bytes || 1024 };
  },
  async cleanupStaging() {},
  async remove(_key: string) {},
  async removeOwner(owner: string) {
    if (removalFails) throw new Error("Temporary storage outage");
    removed.push(owner);
  },
};
const app = await createApp({
  pool,
  auth,
  origins: ["capacitor://localhost"],
  media: mediaAdapter,
});
const users: { uid: string; token: string }[] = [];
const headers = (user: number) => ({
  authorization: `Bearer ${users[user].token}`,
});

before(async () => {
  await app.ready();
  for (let i = 0; i < 6; i++) {
    const response = await fetch(
      `http://${config.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=local-test`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: `test-${randomUUID()}@example.test`,
          password: "local-test-password-123",
          returnSecureToken: true,
        }),
      },
    );
    assert.equal(response.status, 200);
    const result = (await response.json()) as {
      localId: string;
      idToken: string;
    };
    users.push({ uid: result.localId, token: result.idToken });
  }
});

after(async () => {
  await app.close();
  if (users.length) {
    await pool.query("DELETE FROM user_state WHERE user_id = ANY($1)", [
      users.map((u) => u.uid),
    ]);
    await pool.query("DELETE FROM media_objects WHERE user_id = ANY($1)", [
      users.map((u) => u.uid),
    ]);
    await pool.query(
      "DELETE FROM account_deletions WHERE owner_hash = ANY($1)",
      [users.map((u) => ownerHash(u.uid))],
    );
    await pool.query("DELETE FROM request_quotas WHERE owner_hash = ANY($1)", [
      users.map((u) => ownerHash(u.uid)),
    ]);
    await auth.deleteUsers(users.map((u) => u.uid));
  }
  await pool.end();
  await deleteApp(firebase);
});

test("state requires a valid Firebase token; readiness exposes no private data", async () => {
  assert.equal((await app.inject("/healthz")).statusCode, 200);
  assert.equal((await app.inject("/readyz")).statusCode, 200);
  assert.equal((await app.inject("/v1/me/state")).statusCode, 401);
  assert.equal(
    (
      await app.inject({
        url: "/v1/me/state",
        headers: { authorization: "Bearer forged-token" },
      })
    ).statusCode,
    401,
  );
});

test("two signed-in accounts save isolated state and cannot select someone else’s identity", async () => {
  const a = await app.inject({
    method: "PUT",
    url: "/v1/me/state",
    headers: headers(0),
    payload: { state: state("A"), revision: 0 },
  });
  assert.equal(a.statusCode, 200);
  assert.equal(a.json().revision, 1);
  const b = await app.inject({
    url: `/v1/me/state?userId=${users[0].uid}`,
    headers: headers(1),
  });
  assert.deepEqual(b.json(), { state: null, revision: 0, updatedAt: null });
  const impersonation = await app.inject({
    method: "PUT",
    url: "/v1/me/state",
    headers: headers(1),
    payload: { userId: users[0].uid, state: state("stolen"), revision: 1 },
  });
  assert.equal(impersonation.statusCode, 400);
  assert.equal(
    (await app.inject({ url: "/v1/me/state", headers: headers(0) })).json()
      .state.user.name,
    "A",
  );
  assert.equal(
    (await app.inject({ url: "/v1/me", headers: headers(1) })).json().userId,
    users[1].uid,
  );
});

test("stale and concurrent writes cannot silently overwrite another device", async () => {
  const writes = await Promise.all(
    ["first", "second"].map((name) =>
      app.inject({
        method: "PUT",
        url: "/v1/me/state",
        headers: headers(0),
        payload: { state: state(name), revision: 1 },
      }),
    ),
  );
  assert.deepEqual(writes.map((r) => r.statusCode).sort(), [200, 409]);
  const response = await app.inject({
    url: "/v1/me/state",
    headers: headers(0),
  });
  assert.equal(response.json().revision, 2);
  assert.ok(["first", "second"].includes(response.json().state.user.name));
});

test("stored state survives replacing the API instance", async () => {
  const restarted = await createApp({ pool, auth, origins: [] });
  try {
    const response = await restarted.inject({
      url: "/v1/me/state",
      headers: headers(0),
    });
    assert.equal(response.json().revision, 2);
    assert.ok(response.json().updatedAt);
  } finally {
    await restarted.close();
  }
});

test("private photo grants enforce ownership, image types and size limits", async () => {
  const badType = await app.inject({
    method: "POST",
    url: "/v1/me/media",
    headers: headers(0),
    payload: { contentType: "text/html", bytes: 128 },
  });
  assert.equal(badType.statusCode, 400);
  const oversized = await app.inject({
    method: "POST",
    url: "/v1/me/media",
    headers: headers(0),
    payload: { contentType: "image/jpeg", bytes: 9 * 1024 * 1024 },
  });
  assert.equal(oversized.statusCode, 400);
  const upload = await app.inject({
    method: "POST",
    url: "/v1/me/media",
    headers: headers(0),
    payload: { contentType: "image/jpeg", bytes: 1024 },
  });
  assert.equal(upload.statusCode, 201);
  const media = upload.json();
  assert.match(media.upload.fields.key, /^pending\/[a-f0-9]{64}\/[a-f0-9-]+$/);
  assert.equal(media.upload.fields.bytes, "1024");
  assert.equal(
    (await app.inject({ url: `/v1/me/media/${media.id}`, headers: headers(1) }))
      .statusCode,
    404,
  );
  assert.equal(
    (await app.inject({ url: `/v1/me/media/${media.id}`, headers: headers(0) }))
      .statusCode,
    200,
  );
});

test("disabled accounts lose access even with a previously issued token", async () => {
  await auth.updateUser(users[2].uid, { disabled: true });
  assert.equal(
    (await app.inject({ url: "/v1/me/state", headers: headers(2) })).statusCode,
    401,
  );
});

test("production and non-demo projects reject emulator authentication", () => {
  const base = {
    GOOGLE_CLOUD_PROJECT: "demo-quavi",
    DATABASE_URL: "postgresql://localhost/quavi",
    FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  };
  assert.throws(
    () => readConfig({ ...base, NODE_ENV: "production" }),
    /never be enabled/,
  );
  assert.throws(
    () => readConfig({ ...base, K_SERVICE: "quavi" }),
    /never be enabled/,
  );
  assert.throws(
    () => readConfig({ ...base, GOOGLE_CLOUD_PROJECT: "quavi-production" }),
    /isolated demo-/,
  );
});

test("malformed documents, inline photos and unowned media references cannot be saved", async () => {
  const save = (value: unknown) =>
    app.inject({
      method: "PUT",
      url: "/v1/me/state",
      headers: headers(3),
      payload: { state: value, revision: 0 },
    });
  assert.equal((await save({ name: "invalid" })).statusCode, 400);
  assert.equal(
    (
      await save({
        ...state("Invalid"),
        user: { ...state("Invalid").user, name: "x".repeat(25) },
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (await save({ ...state("Invalid"), mood: "data:image/png;base64,abcd" }))
      .statusCode,
    400,
  );
  assert.equal(
    (await save({ ...state("Invalid"), mood: "quavi-media:" + randomUUID() }))
      .statusCode,
    400,
  );
});

test("quota is shared across API instances and does not throttle a different account", async () => {
  await pool.query(
    "INSERT INTO request_quotas(owner_hash,category,window_at,used) VALUES($1,'api',date_trunc('minute',now()),120) ON CONFLICT(owner_hash,category,window_at) DO UPDATE SET used=120",
    [ownerHash(users[3].uid)],
  );
  const restarted = await createApp({ pool, auth, origins: [] });
  try {
    assert.equal(
      (await restarted.inject({ url: "/v1/me/state", headers: headers(3) }))
        .statusCode,
      429,
    );
    assert.equal(
      (await restarted.inject({ url: "/v1/me/state", headers: headers(1) }))
        .statusCode,
      200,
    );
  } finally {
    await restarted.close();
  }
});

test("deletion immediately blocks writes, survives cleanup failure and purges again after upload expiry", async () => {
  const h = headers(4),
    uid = users[4].uid;
  const saved = await app.inject({
    method: "PUT",
    url: "/v1/me/state",
    headers: h,
    payload: { state: state("Delete me"), revision: 0 },
  });
  assert.equal(saved.statusCode, 200);
  const deleting = await app.inject({
    method: "DELETE",
    url: "/v1/me",
    headers: h,
    payload: { confirm: "DELETE" },
  });
  assert.equal(deleting.statusCode, 202);
  assert.equal(
    (
      await app.inject({
        method: "DELETE",
        url: "/v1/me",
        headers: h,
        payload: { confirm: "DELETE" },
      })
    ).statusCode,
    202,
  );
  assert.equal(
    (await app.inject({ url: "/v1/me/state", headers: h })).statusCode,
    410,
  );
  assert.equal(
    (
      await app.inject({
        method: "PUT",
        url: "/v1/me/state",
        headers: h,
        payload: { state: state("Resurrect"), revision: 0 },
      })
    ).statusCode,
    410,
  );
  removalFails = true;
  await processDeletions(pool, auth, mediaAdapter);
  assert.equal(
    (
      await pool.query(
        "SELECT attempts FROM account_deletions WHERE owner_hash=$1",
        [ownerHash(uid)],
      )
    ).rows[0].attempts,
    1,
  );
  removalFails = false;
  await pool.query(
    "UPDATE account_deletions SET retry_at=now() WHERE owner_hash=$1",
    [ownerHash(uid)],
  );
  await processDeletions(pool, auth, mediaAdapter);
  assert.equal((await auth.getUser(uid)).disabled, true);
  assert.equal(removed.filter((o) => o === ownerHash(uid)).length, 1);
  await pool.query(
    "UPDATE account_deletions SET finalize_after=now()-interval '1 minute',retry_at=now() WHERE owner_hash=$1",
    [ownerHash(uid)],
  );
  await processDeletions(pool, auth, mediaAdapter);
  await assert.rejects(auth.getUser(uid));
  assert.equal(removed.filter((o) => o === ownerHash(uid)).length, 2);
  const job = (
    await pool.query("SELECT * FROM account_deletions WHERE owner_hash=$1", [
      ownerHash(uid),
    ])
  ).rows[0];
  assert.equal(job.user_id, null);
  assert.ok(job.completed_at);
  assert.equal(
    (await pool.query("SELECT 1 FROM user_state WHERE user_id=$1", [uid]))
      .rowCount,
    0,
  );
});

test("simultaneous save and deletion cannot resurrect private data", async () => {
  const h = headers(5);
  const results = await Promise.all([
    app.inject({
      method: "PUT",
      url: "/v1/me/state",
      headers: h,
      payload: { state: state("Race"), revision: 0 },
    }),
    app.inject({
      method: "DELETE",
      url: "/v1/me",
      headers: h,
      payload: { confirm: "DELETE" },
    }),
  ]);
  assert.equal(results[1].statusCode, 202);
  assert.ok([200, 410].includes(results[0].statusCode));
  assert.equal(
    (
      await pool.query("SELECT 1 FROM user_state WHERE user_id=$1", [
        users[5].uid,
      ])
    ).rowCount,
    0,
  );
});

test("deletion requires a fresh authentication, not just a refreshed ID token", async () => {
  const future = await createApp({
    pool,
    auth,
    origins: [],
    now: () => Date.now() + 6 * 60 * 1000,
  });
  try {
    const r = await future.inject({
      method: "DELETE",
      url: "/v1/me",
      headers: headers(1),
      payload: { confirm: "DELETE" },
    });
    assert.equal(r.statusCode, 401);
    assert.equal(r.json().code, "reauth_required");
  } finally {
    await future.close();
  }
  assert.equal(
    (
      await pool.query("SELECT 1 FROM account_deletions WHERE owner_hash=$1", [
        ownerHash(users[1].uid),
      ])
    ).rowCount,
    0,
  );
});

test('the state contract accepts prototype stories, shared samples and preferences',async()=>{
  const {OPENINGS,FRIEND_STORIES,buildStory}=await import('../../src/data.ts')
  const {appStateSchema}=await import('../src/state-schema.js')
  for(const opening of OPENINGS) assert.doesNotThrow(()=>appStateSchema.parse({...state('Maya'),story:buildStory(opening),shelf:FRIEND_STORIES}))
})

test('city routes require identity and a configured provider and never return demo fallback on failure',async()=>{
  const input={origin:{lat:48.8566,lng:2.3522},label:'Paris',interests:['cozy'],minutes:60}
  assert.equal((await app.inject({method:'POST',url:'/v1/me/detours',payload:input})).statusCode,401)
  assert.equal((await app.inject({method:'POST',url:'/v1/me/detours',headers:headers(1),payload:input})).statusCode,503)
  const real=await createApp({pool,auth,origins:[],detours:{async nearby(origin){return{updatedAt:new Date().toISOString(),venues:['coffee_shop','bookstore','park','museum'].map((kind,i)=>({id:String(i),name:'Place '+i,kind,ll:{lat:origin.lat+i*.001,lng:origin.lng},confidence:.95,status:'open'}))}}}})
  try{
    const r=await real.inject({method:'POST',url:'/v1/me/detours',headers:headers(1),payload:input});assert.equal(r.statusCode,200);assert.ok(r.json().openings.length);assert.match(r.json().notes[0],/unverified/)
    assert.equal((await real.inject({method:'POST',url:'/v1/me/detours',headers:headers(1),payload:{...input,origin:{lat:999,lng:0}}})).statusCode,400)
  }finally{await real.close()}
})

test('walking preflight authenticates, validates points and returns explicit no-route instead of estimates',async()=>{
 let connected=true;let calls=0;
 const live=await createApp({pool,auth,origins:[],walking:{async check(){calls++;return connected?{legs:[{distance:200,duration:160}],distance:200,duration:160,checkedAt:new Date().toISOString(),provider:'test'}:null}}});
 const request={method:'POST' as const,url:'/v1/me/walking-check',payload:{points:[{lat:40.73,lng:-74},{lat:40.731,lng:-74}]}};
 try{
  assert.equal((await live.inject(request)).statusCode,401);assert.equal(calls,0);
  assert.equal((await live.inject({...request,headers:headers(1),payload:{points:[{lat:0,lng:0},{lat:40,lng:40}]}})).statusCode,400);assert.equal(calls,0);
  const ok=await live.inject({...request,headers:headers(1)});assert.equal(ok.statusCode,200);assert.equal(ok.json().duration,160);
  connected=false;assert.equal((await live.inject({...request,headers:headers(1)})).statusCode,422);
  assert.equal((await app.inject({...request,headers:headers(1)})).statusCode,503);
 }finally{await live.close()}
});

test('provider admission spaces concurrent instances and counts daily failures globally',async()=>{
 const {walkingAdmission}=await import('../src/provider-admission.js');
 await pool.query("DELETE FROM venue_cache WHERE area_key='provider-clock:foot'");
 await pool.query("DELETE FROM request_quotas WHERE owner_hash='project' AND category='walking-provider'");
 try{
  const marks:number[]=[];
  await Promise.all([walkingAdmission(pool),walkingAdmission(pool)].map(async admit=>{await admit();marks.push(Date.now())}));
  marks.sort();assert.ok(marks[1]-marks[0]>=1000);
  await pool.query("UPDATE request_quotas SET used=400 WHERE owner_hash='project' AND category='walking-provider'");
  await assert.rejects(walkingAdmission(pool)(),(e:unknown)=>(e as {statusCode:number}).statusCode===429);
 }finally{
  await pool.query("DELETE FROM venue_cache WHERE area_key='provider-clock:foot'");
  await pool.query("DELETE FROM request_quotas WHERE owner_hash='project' AND category='walking-provider'");
 }
});

test('Google preflight authenticates, checks visit hours and stores only independent data and place identifiers',async()=>{
 const {googlePlace}=await import('../src/google-hours.js');
 let closed=false;
 const geo={async check(){return {legs:[{distance:200,duration:160}],distance:200,duration:160,checkedAt:new Date().toISOString(),provider:'Google Maps'}},async navigate(){return {...await this.check(),geometry:[{lat:40.73,lng:-74},{lat:40.731,lng:-74}],steps:[{maneuver:{type:'depart'},name:'',distance:200,duration:160,start:0}],warnings:['Check local signs']}},async place(){return googlePlace.parse({id:'test-place',displayName:{text:'Test Cafe'},location:{latitude:40.731,longitude:-74},businessStatus:closed?'CLOSED_TEMPORARILY':'OPERATIONAL',currentOpeningHours:{periods:[{open:{day:0,hour:0,minute:0}}]}})}};
 const live=await createApp({pool,auth,origins:[],liveGeo:geo});
 const payload={points:[{lat:40.73,lng:-74},{lat:40.731,lng:-74}],stops:[{name:'Test Cafe',ll:{lat:40.731,lng:-74},mins:20}]};
 try{
  assert.equal((await live.inject({method:'POST',url:'/v1/me/detour-check',payload})).statusCode,401);
  const valid=await live.inject({method:'POST',url:'/v1/me/detour-check',headers:headers(1),payload});assert.equal(valid.statusCode,200);assert.equal(valid.json().hours[0].status,'open');
  closed=true;assert.equal((await live.inject({method:'POST',url:'/v1/me/detour-check',headers:headers(1),payload})).statusCode,422);
  assert.equal((await live.inject({method:'POST',url:'/v1/me/detour-check',headers:headers(1),payload:{...payload,stops:[{...payload.stops[0],ll:{lat:41,lng:-74}}]}})).statusCode,400);
  const {buildStory,OPENINGS}=await import('../../src/data.ts');const story=buildStory(OPENINGS[0]);story.walking=valid.json();story.chapters[0]={...story.chapters[0],googleRoute:true,googlePlaceId:'test-place',hours:valid.json().hours[0],meta:'reported open for your visit'};
  const remote=await live.inject({url:'/v1/me/state',headers:headers(1)});const saved=await live.inject({method:'PUT',url:'/v1/me/state',headers:headers(1),payload:{state:{...state('QA'),story},revision:remote.json().revision}});assert.equal(saved.statusCode,200);
  const restored=await live.inject({url:'/v1/me/state',headers:headers(1)});assert.ok(!JSON.stringify(restored.json()).includes('reported open'));assert.equal(restored.json().state.story.chapters[0].googlePlaceId,'test-place');assert.ok(!restored.json().state.story.walking);
  assert.equal((await live.inject('/legal/privacy')).statusCode,200);assert.match((await live.inject('/legal/terms')).body,/Google Maps\/Google Earth/);
 }finally{await live.close()}
});

test('monthly provider counters survive ordinary quota cleanup until the month ends',async()=>{
 const {cleanupQuotas}=await import('../src/account.js');const owner='quota-test-'+randomUUID();
 try{
  await pool.query("INSERT INTO request_quotas(owner_hash,category,window_at,used) VALUES($1,'google-places',date_trunc('month',now()),499),($1,'ordinary',now()-interval '3 days',1),($1,'google-routes',date_trunc('month',now())-interval '1 month',500)",[owner]);
  await cleanupQuotas(pool);const rows=await pool.query('SELECT category,used FROM request_quotas WHERE owner_hash=$1',[owner]);assert.deepEqual(rows.rows,[{category:'google-places',used:499}]);
 }finally{await pool.query('DELETE FROM request_quotas WHERE owner_hash=$1',[owner])}
});

test('account onboarding progress accepts only known setup steps and keeps old saves valid', async () => {
  const {appStateSchema}=await import('../src/state-schema.js')
  assert.doesNotThrow(()=>appStateSchema.parse(state('Returning')))
  for(const onboarding of ['about','interests','customize','complete']) {
    const value=state('New'); Object.assign(value.user,{onboarding})
    assert.doesNotThrow(()=>appStateSchema.parse(value))
  }
  const value=state('New');Object.assign(value.user,{onboarding:'skip-everything'})
  assert.throws(()=>appStateSchema.parse(value))
})
