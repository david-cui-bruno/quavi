import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { createPool } from "../src/db.js";
import { readConfig } from "../src/config.js";
import { createApp } from "../src/app.js";
import { ownerHash } from "../src/account.js";
import { rewardPlan } from "../src/reward-rules.js";
import { OutingSync } from "../../src/outing-sync.mjs";
const config = readConfig();
if (
  config.GOOGLE_CLOUD_PROJECT !== "demo-quavi" ||
  config.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099"
)
  throw Error("Local emulator only");
const firebase = initializeApp(
    { projectId: "demo-quavi" },
    "rewards-" + randomUUID(),
  ),
  auth = getAuth(firebase),
  pool = createPool(config.DATABASE_URL),
  app = await createApp({ pool, auth, origins: [] }),
  second = await createApp({ pool, auth, origins: [] });
const users: { uid: string; token: string }[] = [];
const headers = (n = 0) => ({
  authorization: "Bearer " + users[n].token,
  "x-quavi-outings": "1",
  "x-quavi-rewards": "1",
});
const call = (
  path: string,
  method = "GET",
  payload?: any,
  n = 0,
  instance = app,
) =>
  instance.inject({
    method: method as any,
    url: "/v1/me" + path,
    headers: headers(n),
    ...(payload ? { payload } : {}),
  });
const state = () => ({
  user: {
    name: "Rewards QA",
    avatar: { color: "Yellow" },
    interests: [],
    neighborhood: "Test",
    authed: true,
    onboarding: "complete",
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
const outing = () => {
  const id = randomUUID();
  return {
    id,
    story: {
      id,
      title: "Reward test",
      openingId: "qa",
      premise: "Demo test",
      chapters: [
        {
          title: "Café",
          place: "Test café",
          kind: "Café",
          ll: { lat: 40, lng: -74 },
          meta: "Café",
          mins: 10,
          desc: "Test",
          walk: "Walk",
          persona: "plain",
          color: "Yellow",
          at: [10, 10],
          alts: [],
        },
      ],
      moments: {},
      tone: "Cozy",
      captions: [],
      date: "Test",
      arrivedStops: [0],
    },
    status: "active",
    chapter: 0,
    tasks: {},
    collected: {},
    tripXp: 0,
    inShelf: false,
    inLibrary: false,
  };
};
const patch = (r: any, changes: any[]) => ({
  kind: "patch",
  operationId: randomUUID(),
  outingId: r.id,
  changes,
});
async function create(r: any, n = 0) {
  const response = await call(
    "/outings/operations",
    "POST",
    { kind: "create", operationId: randomUUID(), outingId: r.id, record: r },
    n,
  );
  assert.equal(response.statusCode, 200, response.body);
  return response.json();
}
before(async () => {
  for (let i = 0; i < 6; i++) {
    const response = await fetch(
      "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=local-test",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "reward-" + randomUUID() + "@example.test",
          password: "local-test-password-123",
          returnSecureToken: true,
        }),
      },
    );
    assert.equal(response.status, 200);
    const d = (await response.json()) as any;
    users.push({ uid: d.localId, token: d.idToken });
  }
});
after(async () => {
  await app.close();
  await second.close();
  for (const u of users) {
    await pool.query("DELETE FROM reward_accounts WHERE user_id=$1", [u.uid]);
    await pool.query("DELETE FROM outings WHERE user_id=$1", [u.uid]);
    await pool.query("DELETE FROM outing_accounts WHERE user_id=$1", [u.uid]);
    await pool.query("DELETE FROM user_state WHERE user_id=$1", [u.uid]);
    await pool.query("DELETE FROM account_deletions WHERE owner_hash=$1", [
      ownerHash(u.uid),
    ]);
    await pool.query("DELETE FROM request_quotas WHERE owner_hash=$1", [
      ownerHash(u.uid),
    ]);
    await auth.deleteUser(u.uid);
  }
  await pool.end();
  await deleteApp(firebase);
});

test("client-supplied balances and redemption history cannot mint server credit", async () => {
  const forged = {
    ...state(),
    game: { ...state().game, xp: 999999, coins: 99999 },
    demoRedemptions: [{ offerId: "cafe", redeemedAt: "fake" }],
  };
  const save = await call("/state", "PUT", { state: forged, revision: 0 });
  assert.equal(save.statusCode, 200);
  const summary = (await call("/rewards")).json();
  assert.equal(summary.confirmedXp, 0);
  assert.equal(summary.legacyXp, 0);
  assert.equal(summary.balance, 0);
  assert.deepEqual(summary.redemptions, []);
  const read = (await call("/state")).json();
  assert.equal(read.state.game.xp, 0);
  assert.equal(read.state.game.coins, 0);
  assert.equal(
    (
      await call("/rewards/redemptions", "POST", {
        operationId: randomUUID(),
        offerId: "cafe",
        amount: 1000,
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await call("/rewards/redemptions", "POST", {
        operationId: randomUUID(),
        offerId: "cafe",
      })
    ).statusCode,
    422,
  );
});
test("task award is computed by the server and cannot repeat through replay or uncheck/recheck", async () => {
  const r = outing();
  r.tripXp = 99999;
  const created = await create(r);
  assert.equal(created.tripXp, 0);
  const task = rewardPlan(r.story)[0].tasks[0],
    command = patch(r, [
      { path: ["tasks", "0/" + task.id], after: true },
      { path: ["tripXp"], before: 99999, after: 88888 },
    ]);
  const first = await call("/outings/operations", "POST", command);
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(first.json().rewardState.confirmedXp, task.xp);
  assert.equal(first.json().tripXp, task.xp);
  const replay = await call("/outings/operations", "POST", command);
  assert.equal(replay.json().rewardState.confirmedXp, task.xp);
  assert.equal(replay.json().revision, first.json().revision);
  await call(
    "/outings/operations",
    "POST",
    patch(r, [{ path: ["tasks", "0/" + task.id], before: true }]),
  );
  await call(
    "/outings/operations",
    "POST",
    patch(r, [{ path: ["tasks", "0/" + task.id], after: true }]),
  );
  assert.equal((await call("/rewards")).json().confirmedXp, task.xp);
  await call(
    "/outings/operations",
    "POST",
    patch(r, [{ path: ["tasks", "0/fake-million-xp"], after: true }]),
  );
  assert.equal((await call("/rewards")).json().confirmedXp, task.xp);
});
test("distinct concurrent tasks merge and first chapter clear and coins award once", async () => {
  const r = outing();
  await create(r, 1);
  const tasks = rewardPlan(r.story)[0].tasks;
  const results = await Promise.all(
    tasks.map((t, i) =>
      call(
        "/outings/operations",
        "POST",
        patch(r, [{ path: ["tasks", "0/" + t.id], after: true }]),
        1,
        i % 2 ? second : app,
      ),
    ),
  );
  assert.ok(results.every((r) => r.statusCode === 200));
  const summary = (await call("/rewards", "GET", undefined, 1)).json();
  assert.equal(
    summary.confirmedXp,
    tasks.reduce((n, t) => n + t.xp, 0),
  );
  assert.equal(summary.coins, 5);
  for (let i = 0; i < 2; i++)
    await call(
      "/outings/operations",
      "POST",
      patch(r, [
        {
          path: ["collected", "4"],
          ...(i ? { before: true } : {}),
          after: true,
        },
        { path: ["collected", "999"], after: true },
      ]),
      1,
    );
  assert.equal((await call("/rewards", "GET", undefined, 1)).json().coins, 6);
});
test("task evidence and award plans are bounded; swapping task metadata cannot farm new XP", async () => {
  const r = outing();
  r.story.arrivedStops = [];
  await create(r, 2);
  const task = rewardPlan(r.story)[0].tasks[0];
  await call(
    "/outings/operations",
    "POST",
    patch(r, [{ path: ["tasks", "0/" + task.id], after: true }]),
    2,
  );
  assert.equal(
    (await call("/rewards", "GET", undefined, 2)).json().confirmedXp,
    0,
  );
  await call(
    "/outings/operations",
    "POST",
    patch(r, [{ path: ["story", "arrivedStops"], before: [], after: [0] }]),
    2,
  );
  const first = (await call("/rewards", "GET", undefined, 2)).json()
    .confirmedXp;
  assert.equal(first, task.xp);
  await call(
    "/outings/operations",
    "POST",
    patch(r, [
      { path: ["story", "prefs"], after: { spend: "$$ Treat myself" } },
      { path: ["tasks", "0/splurge"], after: true },
    ]),
    2,
  );
  assert.equal(
    (await call("/rewards", "GET", undefined, 2)).json().confirmedXp,
    first,
  );
});
test("daily confirmed XP is capped across different outings", async () => {
  for (let i = 0; i < 5; i++) {
    const r = outing();
    r.tasks = Object.fromEntries(
      rewardPlan(r.story)[0].tasks.map((t) => ["0/" + t.id, true]),
    );
    await create(r, 3);
  }
  assert.equal(
    (await call("/rewards", "GET", undefined, 3)).json().confirmedXp,
    100,
  );
});
test("legacy demo history preserves level but contributes no spendable reward credit", async () => {
  await pool.query(
    "INSERT INTO reward_accounts(user_id,legacy_xp,legacy_badges) VALUES($1,5000,$2)",
    [users[4].uid, JSON.stringify(["First detour"])],
  );
  const summary = (await call("/rewards", "GET", undefined, 4)).json();
  assert.equal(summary.xp, 5000);
  assert.equal(summary.confirmedXp, 0);
  assert.equal(summary.balance, 0);
  assert.deepEqual(summary.badges, ["First detour"]);
});
test("two API instances cannot overspend one reward; free welcome and receipts are idempotent", async () => {
  await call("/rewards", "GET", undefined, 4);
  // Trusted historical ledger fixture; the client has no route to insert these awards.
  for (let i = 0; i < 40; i++)
    await pool.query(
      "INSERT INTO reward_ledger(user_id,event_key,kind,xp_delta,created_at) VALUES($1,$2,'task',25,now()-interval '1 day')",
      [users[4].uid, "fixture:" + i],
    );
  const [a, b] = await Promise.all([
    call(
      "/rewards/redemptions",
      "POST",
      { operationId: randomUUID(), offerId: "cafe" },
      4,
      app,
    ),
    call(
      "/rewards/redemptions",
      "POST",
      { operationId: randomUUID(), offerId: "books" },
      4,
      second,
    ),
  ]);
  assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 422]);
  const summary = (await call("/rewards", "GET", undefined, 4)).json();
  assert.equal(summary.balance, 0);
  assert.equal(summary.confirmedXp, 1000);
  const command = { operationId: randomUUID(), offerId: "welcome" };
  const welcome = await call("/rewards/redemptions", "POST", command, 4);
  assert.equal(welcome.statusCode, 200);
  assert.equal(
    (await call("/rewards/redemptions", "POST", command, 4)).statusCode,
    200,
  );
  assert.equal(
    (
      await call(
        "/rewards/redemptions",
        "POST",
        { ...command, offerId: "cafe" },
        4,
      )
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::integer AS n FROM reward_ledger WHERE user_id=$1 AND offer_id='welcome'",
        [users[4].uid],
      )
    ).rows[0].n,
    1,
  );
});
test("the shipped offline queue retains a pending redemption across relaunch and lost acknowledgement", async () => {
  let online = false,
    lost = true;
  const disk = new Map(),
    storage = {
      read: async (k: string) => structuredClone(disk.get(k)),
      write: async (k: string, v: any) => {
        disk.set(k, structuredClone(v));
      },
      remove: async () => {},
    };
  const options = {
    uid: users[5].uid,
    storage,
    available: () => online,
    request: async (method: string, body: any) => {
      const response = await call(
        method === "GET"
          ? "/outings"
          : method === "REDEEM"
            ? "/rewards/redemptions"
            : "/outings/operations",
        method === "GET" ? "GET" : "POST",
        body,
        5,
      );
      if (response.statusCode >= 400)
        throw Object.assign(Error(response.json().error), {
          status: response.statusCode,
        });
      if (method === "REDEEM" && lost) {
        lost = false;
        throw Error("ack lost");
      }
      return response.json();
    },
  };
  let queue = new OutingSync(options);
  await queue.open(state());
  queue.redeem("welcome");
  await queue.checkpoint;
  assert.equal(queue.cache.pendingRewards.length, 1);
  assert.equal(queue.project(state()).demoRedemptions.length, 0);
  queue.close();
  queue = new OutingSync(options);
  await queue.open(state());
  online = true;
  await queue.flush();
  assert.equal(queue.cache.pendingRewards.length, 1);
  await queue.flush();
  assert.equal(queue.cache.pendingRewards.length, 0);
  assert.equal(queue.project(state()).demoRedemptions.length, 1);
  queue.close();
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::integer AS n FROM reward_ledger WHERE user_id=$1 AND offer_id='welcome'",
        [users[5].uid],
      )
    ).rows[0].n,
    1,
  );
});
test('offline task progress stays pending until the shipped queue receives the server award',async()=>{
 let online=true;const disk=new Map(),storage={read:async(k:string)=>structuredClone(disk.get(k)),write:async(k:string,v:any)=>{disk.set(k,structuredClone(v))},remove:async()=>{}}
 const queue=new OutingSync({uid:users[5].uid,storage,available:()=>online,request:async(method:string,body:any)=>{const response=await call(method==='GET'?'/outings':'/outings/operations',method==='GET'?'GET':'POST',body,5);if(response.statusCode>=400)throw Object.assign(Error(response.json().error),{status:response.statusCode});return response.json()}})
 await queue.open(state());online=false;const before=queue.project(state()),r=outing(),task=rewardPlan(r.story)[0].tasks[0]
 queue.edit(before,{...before,story:{...r.story,status:'active',outingPhase:'active'},game:{...before.game,done:{[r.id+':0']:[task.id]}}});await queue.checkpoint
 assert.equal(queue.project(state()).game.xp,0,'offline progress cannot self-award confirmed XP')
 online=true;await queue.flush();assert.equal(queue.status,'saved');assert.equal(queue.project(state()).game.xp,task.xp);queue.close()
})

test("activated reward accounts reject old-client writes and deletion purges ledger and receipts", async () => {
  const old = await app.inject({
    method: "PUT",
    url: "/v1/me/state",
    headers: {
      authorization: "Bearer " + users[5].token,
      "x-quavi-outings": "1",
    },
    payload: { state: state(), revision: 0 },
  });
  assert.equal(old.statusCode, 409);
  assert.equal(
    (await call("", "DELETE", { confirm: "DELETE" }, 5)).statusCode,
    202,
  );
  assert.equal(
    (
      await pool.query("SELECT 1 FROM reward_ledger WHERE user_id=$1", [
        users[5].uid,
      ])
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await pool.query("SELECT 1 FROM reward_requests WHERE user_id=$1", [
        users[5].uid,
      ])
    ).rowCount,
    0,
  );
  assert.equal((await call("/rewards", "GET", undefined, 5)).statusCode, 410);
});
