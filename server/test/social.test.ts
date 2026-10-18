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
    "social-" + randomUUID(),
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
          email: "social-" + randomUUID() + "@example.test",
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

test("lookup uses exact handles and exposes no account/email/location or directory", async () => {
  const r = await call(0, "/social/lookup", "POST", {
    handle: users[1].handle.toUpperCase(),
  });
  assert.deepEqual(r.json().people, [
    { id: users[1].id, handle: users[1].handle, name: "Quavi explorer" },
  ]);
  assert.equal(
    (
      await call(0, "/social/lookup", "POST", {
        handle: users[1].handle.slice(0, -1),
      })
    ).json().people.length,
    0,
  );
  assert.equal(
    (await call(0, "/social/lookup", "POST", { handle: "friend@example.test" }))
      .statusCode,
    400,
  );
  assert.equal(
    (
      await call(0, "/social/lookup", "POST", { handle: users[0].handle })
    ).json().people.length,
    0,
  );
});
test("handle uniqueness is serialized across API instances", async () => {
  const handle = "qa_" + randomUUID().replaceAll("-", "").slice(0, 18);
  const results = await Promise.all([
    call(6, "/social/profile", "PUT", { handle }),
    call(7, "/social/profile", "PUT", { handle }, other),
  ]);
  assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 409]);
});
test("pending requests grant no access; only recipient accepts; repeats converge", async () => {
  const { id, photoId } = await outing(),
    post = await publish(0, id);
  assert.equal((await call(1, "/social/posts/" + post)).statusCode, 404);
  await relate(0, 1, "request");
  await relate(0, 1, "request", other);
  assert.equal((await call(1, "/social")).json().incoming.length, 1);
  assert.equal((await relate(0, 1, "accept")).statusCode, 409);
  assert.equal(
    (await call(1, "/social/posts/" + post + "/media/" + photoId)).statusCode,
    404,
  );
  assert.equal((await call(1, "/social")).json().feed.length, 0);
  assert.equal((await relate(1, 0, "accept")).statusCode, 200);
  assert.equal((await relate(1, 0, "accept", other)).statusCode, 200);
  const view = (await call(1, "/social/posts/" + post)).json();
  assert.equal(view.owner.id, users[0].id);
  assert.equal(view.story.origin, undefined);
  assert.equal(view.story.arrivedStops, undefined);
  assert.equal(view.story.prefs, undefined);
  assert.equal(view.story.chapters[0].ll, undefined);
  assert.equal(view.story.sharedNotes.length, 1);
  assert.equal(view.story.sharedNotes[0].note, "Cardamom latte");
  assert(!JSON.stringify(view).includes("Hidden draft"));
  assert(!JSON.stringify(view).includes(users[0].uid));
  assert.equal((await call(2, "/social/posts/" + post)).statusCode, 404);
  assert.equal((await call(2, "/social")).json().feed.length, 0);
  assert.equal((await call(1, "/media/" + photoId)).statusCode, 404);
  assert.equal(
    (await call(1, "/social/posts/" + post + "/media/" + photoId)).statusCode,
    200,
  );
  assert.equal(
    (await call(1, "/social/posts/" + post + "/media/" + randomUUID()))
      .statusCode,
    404,
  );
});
test("decline and cancel retain no access; crossed requests do not silently accept", async () => {
  await relate(2, 3, "request");
  await relate(3, 2, "request");
  assert.equal((await call(2, "/social")).json().friends.length, 0);
  assert.equal((await relate(2, 3, "decline")).statusCode, 409);
  await relate(3, 2, "decline");
  assert.equal((await call(2, "/social")).json().outgoing.length, 0);
  await relate(2, 3, "request");
  await relate(2, 3, "cancel");
  await relate(2, 3, "cancel");
  assert.equal((await call(3, "/social")).json().incoming.length, 0);
});
test("publish uses only owned saved completed outings and is retry-safe", async () => {
  const active = await outing(2, false);
  assert.equal(
    (await call(2, "/social/posts", "POST", { outingId: active.id }))
      .statusCode,
    422,
  );
  const complete = await outing(2);
  const post = await publish(2, complete.id);
  assert.equal(await publish(2, complete.id), post);
  assert.equal(
    (await call(3, "/social/posts", "POST", { outingId: complete.id }))
      .statusCode,
    422,
  );
  assert.equal(
    (
      await call(2, "/social/posts", "POST", {
        outingId: complete.id,
        story: { title: "Forged" },
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (await call(3, "/social/posts/" + post, "DELETE")).statusCode,
    200,
  );
  assert.equal((await call(2, "/social/posts/" + post)).statusCode, 200);
});
test("remove, block, unblock and re-request enforce story and photo access", async () => {
  const r = await outing(4),
    post = await publish(4, r.id);
  await friends(4, 5);
  assert.equal((await call(5, "/social/posts/" + post)).statusCode, 200);
  await relate(4, 5, "remove");
  assert.equal((await call(5, "/social/posts/" + post)).statusCode, 404);
  assert.equal(
    (await call(5, "/social/posts/" + post + "/media/" + r.photoId)).statusCode,
    404,
  );
  await friends(4, 5);
  await relate(5, 4, "block");
  assert.equal(
    (
      await call(4, "/social/lookup", "POST", { handle: users[5].handle })
    ).json().people.length,
    0,
  );
  assert.equal((await relate(4, 5, "request")).statusCode, 404);
  assert.equal((await call(5, "/social")).json().friends.length, 0);
  assert.equal(
    (await call(5, "/social/posts/" + post + "/media/" + r.photoId)).statusCode,
    404,
  );
  await relate(5, 4, "unblock");
  assert.equal((await call(5, "/social/posts/" + post)).statusCode, 404);
  await friends(4, 5);
  assert.equal((await call(5, "/social/posts/" + post)).statusCode, 200);
  await call(4, "/social/posts/" + post, "DELETE");
  assert.equal((await call(5, "/social/posts/" + post)).statusCode, 404);
  assert.equal(
    (await call(5, "/social/posts/" + post + "/media/" + r.photoId)).statusCode,
    404,
  );
});
test("block racing accept cannot leave an accepted friendship", async () => {
  await relate(2, 3, "request");
  const results = await Promise.all([
    relate(3, 2, "accept"),
    relate(2, 3, "block", other),
  ]);
  assert(results.every((r) => [200, 404].includes(r.statusCode)));
  assert.equal((await call(2, "/social")).json().friends.length, 0);
  assert.equal((await call(3, "/social")).json().friends.length, 0);
  await relate(2, 3, "unblock");
});
test("reporting stores bounded private reports without giving the reporter more access", async () => {
  const r = await outing(4),
    post = await publish(4, r.id);
  await friends(4, 5);
  assert.equal(
    (
      await call(2, "/social/reports", "POST", {
        targetId: users[4].id,
        postId: post,
        reason: "spam",
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await call(5, "/social/reports", "POST", {
        targetId: users[4].id,
        postId: post,
        reason: "unsafe",
        details: "QA report",
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await call(5, "/social/reports", "POST", {
        targetId: users[4].id,
        reason: "other",
        details: "x".repeat(1001),
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::integer AS n FROM social_reports WHERE reporter=$1",
        [users[5].uid],
      )
    ).rows[0].n,
    1,
  );
});
test("unsharing and account deletion remove circle access and dependent private records", async () => {
  const r = await outing(6),
    post = await publish(6, r.id);
  await friends(6, 7);
  assert.equal((await call(7, "/social/posts/" + post)).statusCode, 200);
  assert.equal(
    (await call(6, "", "DELETE", { confirm: "DELETE" })).statusCode,
    202,
  );
  assert.equal((await call(7, "/social/posts/" + post)).statusCode, 404);
  assert.equal(
    (await call(7, "/social/posts/" + post + "/media/" + r.photoId)).statusCode,
    404,
  );
  assert.equal((await call(7, "/social")).json().friends.length, 0);
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::integer AS n FROM social_profiles WHERE user_id=$1",
        [users[6].uid],
      )
    ).rows[0].n,
    0,
  );
});
test("unauthenticated clients cannot read the circle or shared media", async () => {
  assert.equal(
    (await app.inject({ method: "GET", url: "/v1/me/social" })).statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        method: "GET",
        url: "/v1/me/social/posts/" + randomUUID() + "/media/" + randomUUID(),
      })
    ).statusCode,
    401,
  );
});

test("reports expire after 90 days and reporter deletion cascades current reports", async () => {
  await pool.query(
    "UPDATE social_reports SET created_at=now()-interval '91 days' WHERE reporter=$1",
    [users[5].uid],
  );
  await cleanupSocialReports(pool);
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::integer AS n FROM social_reports WHERE reporter=$1",
        [users[5].uid],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await call(5, "/social/reports", "POST", {
        targetId: users[4].id,
        reason: "spam",
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (await call(5, "", "DELETE", { confirm: "DELETE" })).statusCode,
    202,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::integer AS n FROM social_reports WHERE reporter=$1",
        [users[5].uid],
      )
    ).rows[0].n,
    0,
  );
});
