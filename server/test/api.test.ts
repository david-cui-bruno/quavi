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
