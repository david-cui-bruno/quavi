import { cleanupSocialReports } from "../src/social.js";
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
import type { MediaSigner } from "../src/media.js";
const config = readConfig();
if (
  config.GOOGLE_CLOUD_PROJECT !== "demo-quavi" ||
  config.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099"
)
  throw Error("Local emulator only");
const firebase = initializeApp(
    { projectId: "demo-quavi" },
    "delivery-" + randomUUID(),
  ),
  auth = getAuth(firebase),
  pool = createPool(config.DATABASE_URL);
const signed: string[] = [];
const media = {
  read: async (key: string) => {
    signed.push(key);
    return "https://example.test/" + key;
  },
} as MediaSigner;
import { dispatchPush } from "../src/push.js";
const app = await createApp({ pool, auth, origins: [], media }),
  other = await createApp({ pool, auth, origins: [], media });
const users: { uid: string; token: string; id: string; handle: string }[] = [];
const call = (
  n: number,
  path: string,
  method = "GET",
  body?: unknown,
  instance = app,
) =>
  instance.inject({
    method: method as any,
    url: "/v1/me" + path,
    headers: {
      authorization: "Bearer " + users[n].token,
      "x-quavi-outings": "1",
      "x-quavi-rewards": "1",
    },
    ...(body === undefined ? {} : { payload: body }),
  });
const relate = (n: number, t: number, action: string, instance = app) =>
  call(
    n,
    "/social/relationships",
    "POST",
    { targetId: users[t].id, action },
    instance,
  );
function story(id: string) {
  return {
    id,
    title: "A story for my circle",
    openingId: "qa",
    premise: "A private outing",
    origin: { lat: 12, lng: 13 },
    prefs: { who: "Solo" },
    arrivedStops: [0],
    chapters: [
      {
        title: "Coffee",
        place: "Test café",
        kind: "Café",
        ll: { lat: 40, lng: -74 },
        meta: "Café",
        mins: 10,
        desc: "A café stop",
        walk: "Walk",
        persona: "Pip",
        color: "Yellow",
        at: [10, 10],
        alts: [],
      },
    ],
    moments: {},
    tone: "Cozy",
    captions: ["A good coffee"],
    date: "Today",
    intro: "Hello friends",
    taskNotes: {
      "0/order": "Cardamom latte",
      "0/private_unknown": "Hidden draft",
    },
  };
}
async function outing(n = 0, completed = true) {
  const id = randomUUID(),
    s = story(id),
    photoId = randomUUID(),
    key = rewardPlan(s)[0].tasks[0].id;
  s.taskNotes = { ...s.taskNotes, [`0:${key}`]: "Cardamom latte" };
  const photoKey = rewardPlan(s)[0].tasks.at(-1)!.id;
  Object.assign(s, {
    taskPhotos: { ["0:" + photoKey]: "quavi-media:" + photoId },
  });
  await pool.query(
    "INSERT INTO media_objects(id,user_id,object_key,content_type,bytes,uploaded_at) VALUES($1,$2,$3,$4,10,now())",
    [photoId, users[n].uid, "users/test/" + photoId, "image/jpeg"],
  );
  const record = {
    id,
    story: s,
    status: completed ? "completed" : "active",
    chapter: 0,
    tasks: {},
    collected: {},
    tripXp: 0,
    inShelf: completed,
    inLibrary: false,
  };
  const result = await call(n, "/outings/operations", "POST", {
    kind: "create",
    operationId: randomUUID(),
    outingId: id,
    record,
  });
  assert.equal(result.statusCode, 200, result.body);
  return { id, photoId };
}
async function publish(n: number, id: string) {
  const r = await call(n, "/social/posts", "POST", { outingId: id });
  assert.equal(r.statusCode, 200, r.body);
  return r.json().myPosts.find((x: any) => x.outingId === id).id as string;
}
async function friends(a: number, b: number) {
  assert.equal((await relate(a, b, "request")).statusCode, 200);
  assert.equal((await relate(b, a, "accept")).statusCode, 200);
}
before(async () => {
  for (let n = 0; n < 8; n++) {
    const r = await fetch(
      "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=local",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "delivery-" + randomUUID() + "@example.test",
          password: "local-password-123",
          returnSecureToken: true,
        }),
      },
    );
    assert.equal(r.status, 200);
    const d = (await r.json()) as any;
    users.push({ uid: d.localId, token: d.idToken, id: "", handle: "" });
    const result = await call(n, "/social");
    assert.equal(result.statusCode, 200, result.body);
    Object.assign(users[n], {
      id: result.json().me.id,
      handle: result.json().me.handle,
    });
  }
});
after(async () => {
  await app.close();
  await other.close();
  for (const u of users) {
    await pool.query("DELETE FROM social_profiles WHERE user_id=$1", [u.uid]);
    await pool.query("DELETE FROM reward_accounts WHERE user_id=$1", [u.uid]);
    await pool.query("DELETE FROM outings WHERE user_id=$1", [u.uid]);
    await pool.query("DELETE FROM outing_accounts WHERE user_id=$1", [u.uid]);
    await pool.query("DELETE FROM user_state WHERE user_id=$1", [u.uid]);
    await pool.query("DELETE FROM media_objects WHERE user_id=$1", [u.uid]);
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

test("notifications are idempotent, recipient-owned and revoked with access", async () => {
  await relate(0, 1, "request");
  await relate(0, 1, "request");
  let list = (await call(1, "/social/notifications")).json();
  assert.equal(list.items.length, 1);
  assert.equal(list.unread, 1);
  assert.equal((await call(0, "/social/notifications")).json().items.length, 0);
  await call(0, "/social/notifications/read", "POST", {
    ids: [list.items[0].id],
  });
  assert.equal((await call(1, "/social/notifications")).json().unread, 1);
  await relate(1, 0, "accept");
  await relate(1, 0, "accept");
  assert.equal(
    (await call(0, "/social/notifications"))
      .json()
      .items.filter((n: any) => n.kind === "friend_accepted").length,
    1,
  );
  const r = await outing(0);
  const post = await publish(0, r.id);
  await publish(0, r.id);
  list = (await call(1, "/social/notifications")).json();
  assert.equal(
    list.items.filter((n: any) => n.kind === "story_shared").length,
    1,
  );
  await call(1, "/social/notifications/read", "POST", {
    ids: list.items.map((n: any) => n.id),
  });
  assert.equal((await call(1, "/social/notifications")).json().unread, 0);
  assert.equal((await call(2, "/social/notifications")).json().items.length, 0);
  await call(0, "/social/posts/" + post, "DELETE");
  assert.equal((await call(1, "/social/notifications")).json().items.length, 0);
  await relate(1, 0, "block");
  assert.equal((await call(0, "/social/notifications")).json().items.length, 0);
});
test("private report review requires verified staff claim and audit, hides stories without republish bypass", async () => {
  await friends(2, 3);
  const r = await outing(2);
  const post = await publish(2, r.id);
  const body = {
    targetId: users[2].id,
    postId: post,
    reason: "spam",
    details: "Test report",
  };
  await call(3, "/social/reports", "POST", body);
  await call(3, "/social/reports", "POST", body);
  assert.equal((await call(3, "/social/moderation")).statusCode, 403);
  const custom = await auth.createCustomToken(users[7].uid, {
    quaviModerator: true,
  });
  const response = await fetch(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=local",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: custom, returnSecureToken: true }),
    },
  );
  users[7].token = ((await response.json()) as any).idToken;
  const queue = await call(7, "/social/moderation");
  assert.equal(queue.statusCode, 200, queue.body);
  const report = queue.json().items.find((r: any) => r.postId === post);
  assert.ok(report);
  assert.equal(
    queue.json().items.filter((r: any) => r.postId === post).length,
    1,
  );
  const evidence = (await call(7, "/social/moderation/" + report.id)).json();
  assert.ok(!JSON.stringify(evidence).includes("origin"));
  const decision = {
    reportId: report.id,
    action: "hide_story",
    note: "Synthetic review decision",
  };
  assert.equal(
    (await call(7, "/social/moderation", "POST", decision)).statusCode,
    200,
  );
  await call(7, "/social/moderation", "POST", decision);
  assert.equal((await call(3, "/social/posts/" + post)).statusCode, 404);
  assert.equal(
    (await call(3, "/social/notifications"))
      .json()
      .items.filter((n: any) => n.kind === "report_update").length,
    1,
  );
  await call(2, "/social/posts/" + post, "DELETE");
  assert.equal(
    (await call(2, "/social/posts", "POST", { outingId: r.id })).statusCode,
    403,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM moderation_actions WHERE report_id=$1",
        [report.id],
      )
    ).rows[0].n,
    1,
  );
});
test("feed keyset pagination handles timestamp ties, malformed cursors and revoked access", async () => {
  await friends(4, 5);
  const r = await outing(4),
    base = (
      await pool.query(
        "SELECT document FROM outings WHERE user_id=$1 AND id=$2",
        [users[4].uid, r.id],
      )
    ).rows[0].document;
  for (let i = 0; i < 24; i++) {
    const id = randomUUID();
    const doc = { ...base, id, story: { ...base.story, id } };
    await pool.query(
      "INSERT INTO outings(user_id,id,document,revision) VALUES($1,$2,$3,1)",
      [users[4].uid, id, doc],
    );
    await pool.query(
      "INSERT INTO social_posts(id,user_id,outing_id,created_at) VALUES($1,$2,$3,'2026-01-01T12:00:00.123456Z')",
      [randomUUID(), users[4].uid, id],
    );
  }
  const first = (await call(5, "/social/feed")).json();
  assert.equal(first.feed.length, 20);
  assert.ok(first.nextCursor);
  const second = (
    await call(5, "/social/feed?cursor=" + encodeURIComponent(first.nextCursor))
  ).json();
  assert.equal(second.feed.length, 4);
  assert.equal(
    new Set([...first.feed, ...second.feed].map((p) => p.id)).size,
    24,
  );
  assert.equal((await call(5, "/social/feed?cursor=bad")).statusCode, 400);
  await relate(5, 4, "remove");
  assert.equal(
    (
      await call(
        5,
        "/social/feed?cursor=" + encodeURIComponent(first.nextCursor),
      )
    ).json().feed.length,
    0,
  );
});
test("push retries and invalid tokens are bounded, rebinding isolates accounts, revoked content is not delivered", async () => {
  const token = "a".repeat(64);
  await call(0, "/social/devices", "PUT", { token, environment: "sandbox" });
  await relate(1, 0, "unblock");
  await relate(1, 0, "request");
  let sent = 0;
  await dispatchPush(pool, async () => {
    sent++;
    return "retry";
  });
  assert.equal(sent, 1);
  assert.equal(
    (
      await pool.query("SELECT sent_at FROM push_deliveries WHERE token=$1", [
        token,
      ])
    ).rows[0].sent_at,
    null,
  );
  await pool.query(
    "UPDATE push_deliveries SET retry_at=now()-interval '1 second' WHERE token=$1",
    [token],
  );
  await dispatchPush(pool, async () => {
    sent++;
    return "sent";
  });
  assert.equal(sent, 2);
  await dispatchPush(pool, async () => {
    sent++;
    return "sent";
  });
  assert.equal(sent, 2);
  await call(2, "/social/devices", "PUT", { token, environment: "production" });
  assert.equal(
    (
      await pool.query("SELECT user_id FROM push_devices WHERE token=$1", [
        token,
      ])
    ).rows[0].user_id,
    users[2].uid,
  );
  await call(0, "/social/devices", "DELETE", { token });
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM push_devices WHERE token=$1",
        [token],
      )
    ).rows[0].n,
    1,
  );
  await relate(6, 2, "request");
  await relate(6, 2, "cancel");
  await dispatchPush(pool, async () => {
    throw Error("cancelled request must not send");
  });
  await relate(6, 2, "request");
  await dispatchPush(pool, async () => "invalid");
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM push_devices WHERE token=$1",
        [token],
      )
    ).rows[0].n,
    0,
  );
});

test('restrictions preserve private outings and safety controls; nonstaff cannot read moderation evidence',async()=>{
 const r=await outing(6);const post=await publish(6,r.id);
 await call(0,'/social/reports','POST',{targetId:users[6].id,reason:'harassment'});
 const report=(await call(7,'/social/moderation')).json().items.find((r:any)=>r.target.id===users[6].id);
 assert.ok(report);
 assert.equal((await call(7,'/social/moderation','POST',{reportId:report.id,action:'restrict_user',note:'Synthetic seven day restriction'})).statusCode,200);
 assert.equal((await relate(6,5,'request')).statusCode,403);
 assert.equal((await call(6,'/social/posts','POST',{outingId:r.id})).statusCode,403);
 assert.equal((await call(6,'/outings')).statusCode,200);
 assert.equal((await relate(6,5,'block')).statusCode,200);
 assert.equal((await call(6,'/social/posts/'+post)).statusCode,404);
 assert.equal((await call(0,'/social/moderation/'+report.id)).statusCode,403);
 assert.equal((await call(0,'/social/moderation/'+report.id+'/media/'+randomUUID())).statusCode,403);
 await call(7,'/social/reports','POST',{targetId:users[6].id,reason:'other'});
 const own=(await call(7,'/social/moderation')).json().items.find((r:any)=>r.reporterHandle===users[7].handle);
 assert.equal((await call(7,'/social/moderation','POST',{reportId:own.id,action:'dismiss',note:'Must require another reviewer'})).statusCode,403);
});
