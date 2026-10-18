import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { createPool } from "../src/db.js";
import { readConfig } from "../src/config.js";
import { createApp } from "../src/app.js";
import { ownerHash } from "../src/account.js";
import { patchOuting } from "../src/outings.js";
// Exercise the shipped client journal against the real API and PostgreSQL, not a second sync implementation.
import { OutingSync, profileOnly } from "../../src/outing-sync.mjs";
const config = readConfig();
if (
  config.GOOGLE_CLOUD_PROJECT !== "demo-quavi" ||
  config.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099"
)
  throw new Error("Local emulator only");
const firebase = initializeApp(
    { projectId: "demo-quavi" },
    "outings-" + randomUUID(),
  ),
  auth = getAuth(firebase),
  pool = createPool(config.DATABASE_URL);
const app = await createApp({ pool, auth, origins: [] });
const users: { uid: string; token: string }[] = [];
const story = (id = randomUUID()) => ({
  id,
  title: "Test outing",
  openingId: "fixture",
  premise: "A local test",
  chapters: [
    {
      title: "Stop",
      place: "Test café",
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
});
const state = (s?: any) => ({
  user: {
    name: "Test",
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
  ...(s ? { story: s } : {}),
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
const record = (id = randomUUID()) => ({
  id,
  story: story(id),
  status: "planned",
  chapter: 0,
  tasks: {},
  collected: {},
  tripXp: 0,
  inShelf: false,
  inLibrary: false,
});
const headers = (n = 0) => ({
  authorization: "Bearer " + users[n].token,
  "x-quavi-outings": "1",
});
const call = (method: string, url: string, payload?: any, n = 0) =>
  app.inject({
    method: method as any,
    url: "/v1/me" + url,
    headers: headers(n),
    ...(payload ? { payload } : {}),
  });
const create = (r: any) => ({
  kind: "create",
  operationId: randomUUID(),
  outingId: r.id,
  record: r,
});
const patch = (id: string, changes: any[]) => ({
  kind: "patch",
  operationId: randomUUID(),
  outingId: id,
  changes,
});
before(async () => {
  for (let i = 0; i < 2; i++) {
    const response = await fetch(
      "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=local-test",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "outing-" + randomUUID() + "@example.test",
          password: "local-test-password-123",
          returnSecureToken: true,
        }),
      },
    );
    assert.equal(response.status, 200);
    const r = (await response.json()) as any;
    users.push({ uid: r.localId, token: r.idToken });
  }
});
after(async () => {
  await app.close();
  for (const u of users) {
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

test("legacy migration copies progress once, keeps accounts private and prevents old builds overwriting migrated state", async () => {
  const s = story(),
    legacy = state({ ...s, status: "active" });
  legacy.game.done = { [s.id + ":0"]: ["task-a"] } as any;
  // A legacy build writes before migration.
  const saved = await app.inject({
    method: "PUT",
    url: "/v1/me/state",
    headers: { authorization: "Bearer " + users[0].token },
    payload: { state: legacy, revision: 0 },
  });
  assert.equal(saved.statusCode, 200);
  const first = await call("GET", "/outings");
  assert.equal(first.statusCode, 200);
  const migrated = first.json().outings.find((r: any) => r.id === s.id);
  assert.equal(migrated.status, "paused");
  assert.equal(migrated.tasks["0/task-a"], true);
  assert.equal(
    (await call("GET", "/outings", undefined, 1)).json().outings.length,
    0,
  );
  const again = (await call("GET", "/outings")).json().outings;
  assert.equal(again.find((r: any) => r.id === s.id).revision, 1);
  const cleared = await call("PUT", "/state", {
    state: profileOnly(legacy),
    revision: 1,
  });
  assert.equal(cleared.statusCode, 200);
  assert.equal(
    (await call("GET", "/outings"))
      .json()
      .outings.find((r: any) => r.id === s.id).tasks["0/task-a"],
    true,
  );
  assert.equal(
    (
      await app.inject({
        method: "PUT",
        url: "/v1/me/state",
        headers: { authorization: "Bearer " + users[0].token },
        payload: { state: legacy, revision: 2 },
      })
    ).statusCode,
    409,
  );
});
test("operation receipts survive replay, detect changed payloads and merge concurrent different fields", async () => {
  const r = record(),
    op = create(r);
  const first = await call("POST", "/outings/operations", op);
  assert.equal(first.statusCode, 200);
  const repeat = await call("POST", "/outings/operations", op);
  assert.equal(repeat.json().revision, first.json().revision);
  assert.equal(
    (
      await call("POST", "/outings/operations", {
        ...op,
        record: { ...r, chapter: 1 },
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await call("POST", "/outings/operations", {
        ...op,
        record: { ...r, tripXp: 2 },
      })
    ).statusCode,
    409,
  );
  const [a, b] = await Promise.all([
    call(
      "POST",
      "/outings/operations",
      patch(r.id, [{ path: ["story", "taskNotes", "0:a"], after: "A" }]),
    ),
    call(
      "POST",
      "/outings/operations",
      patch(r.id, [{ path: ["tasks", "0/b"], after: true }]),
    ),
  ]);
  assert.equal(a.statusCode, 200);
  assert.equal(b.statusCode, 200);
  const saved = (await call("GET", "/outings"))
    .json()
    .outings.find((o: any) => o.id === r.id);
  assert.equal(saved.story.taskNotes["0:a"], "A");
  assert.equal(saved.tasks["0/b"], true);
  const conflicting = await call(
    "POST",
    "/outings/operations",
    patch(r.id, [{ path: ["story", "taskNotes", "0:a"], after: "B" }]),
  );
  assert.equal(conflicting.statusCode, 409);
  assert.equal(
    (
      await call(
        "POST",
        "/outings/operations",
        patch(r.id, [
          { path: ["story", "__proto__", "polluted"], after: true },
        ]),
      )
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await call(
        "POST",
        "/outings/operations",
        patch(r.id, [{ path: ["tripXp"], before: 0, after: 1 }]),
        1,
      )
    ).statusCode,
    404,
  );
});
test("different offline notes in a previously empty note map merge without conflict", async () => {
  const r = record();
  await call("POST", "/outings/operations", create(r));
  for (const key of ["first", "second"])
    assert.equal(
      (
        await call(
          "POST",
          "/outings/operations",
          patch(r.id, [{ path: ["story", "taskNotes", key], after: key }]),
        )
      ).statusCode,
      200,
    );
  const saved = (await call("GET", "/outings"))
    .json()
    .outings.find((o: any) => o.id === r.id);
  assert.deepEqual(saved.story.taskNotes, { first: "first", second: "second" });
});
test("lifecycle is terminal and media references must be owned and uploaded", async () => {
  const r = record();
  await call("POST", "/outings/operations", create(r));
  assert.equal(
    (
      await call(
        "POST",
        "/outings/operations",
        patch(r.id, [
          { path: ["status"], before: "planned", after: "completed" },
        ]),
      )
    ).statusCode,
    409,
  );
  for (const [before, after] of [
    ["planned", "active"],
    ["active", "paused"],
    ["paused", "completed"],
  ])
    assert.equal(
      (
        await call(
          "POST",
          "/outings/operations",
          patch(r.id, [{ path: ["status"], before, after }]),
        )
      ).statusCode,
      200,
    );
  assert.equal(
    (
      await call(
        "POST",
        "/outings/operations",
        patch(r.id, [
          { path: ["status"], before: "completed", after: "active" },
        ]),
      )
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await call(
        "POST",
        "/outings/operations",
        patch(r.id, [
          {
            path: ["story", "taskPhotos", "0:p"],
            after: "quavi-media:" + randomUUID(),
          },
        ]),
      )
    ).statusCode,
    400,
  );
});
test("Google responses are scrubbed from independently persisted outing records", async () => {
  const r = record();
  r.story = {
    ...r.story,
    walking: {
      provider: "Google Maps",
      geometry: "transient",
      checkedAt: new Date().toISOString(),
    },
    chapters: r.story.chapters.map((c) => ({
      ...c,
      hours: { status: "open" },
      googleRoute: true,
    })),
  } as any;
  // The wire protocol accepts only already-scrubbed records from new clients.
  const { scrubGoogleContent } = await import("../src/google-retention.js");
  const response = await call(
    "POST",
    "/outings/operations",
    create(scrubGoogleContent(r)),
  );
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().story.walking, undefined);
  assert.equal(response.json().story.chapters[0].hours, undefined);
});

test("offline journal reopens after termination, replays a lost acknowledgement once, and separates profile edits", async () => {
  const disk = new Map(),
    storage = {
      read: async (k: string) => structuredClone(disk.get(k)),
      write: async (k: string, v: any) => {
        disk.set(k, structuredClone(v));
      },
      remove: async (k: string) => {
        disk.delete(k);
      },
    };
  let online = false,
    lost = false,
    posts = 0;
  const request = async (method: string, body: any) => {
    if (!online) throw Error("offline");
    const result = await call(
      method,
      method === "GET" ? "/outings" : "/outings/operations",
      body,
      1,
    );
    if (result.statusCode >= 400)
      throw Object.assign(Error(result.json().error), {
        status: result.statusCode,
      });
    if (method === "POST") {
      posts++;
      if (lost) {
        lost = false;
        throw Error("ack lost");
      }
    }
    return result.json();
  };
  const options = {
    uid: users[1].uid,
    storage,
    request,
    available: () => online,
  };
  let engine = new OutingSync(options);
  await engine.open(state());
  const before = engine.project(state()),
    s = story(),
    next = { ...before, story: s };
  engine.edit(before, next);
  await engine.checkpoint;
  engine.close();
  engine = new OutingSync(options);
  await engine.open(state());
  assert.equal(engine.project(state()).story.id, s.id);
  online = true;
  lost = true;
  await engine.flush();
  assert.equal(engine.status, "offline");
  assert.equal(engine.cache.pending.length, 1);
  await engine.flush();
  assert.equal(engine.status, "saved");
  assert.equal(posts, 2);
  const records = (await call("GET", "/outings", undefined, 1)).json().outings;
  assert.equal(records.filter((r: any) => r.id === s.id).length, 1);
  assert.equal(records.find((r: any) => r.id === s.id).revision, 1);
  const snapshot = engine.project(state());
  online = false;
  engine.edit(snapshot, {
    ...snapshot,
    story: { ...snapshot.story, taskNotes: { "0:n": "offline note" } },
  });
  await engine.checkpoint;
  engine.close();
  const reopened = new OutingSync(options);
  await reopened.open({
    ...state(),
    user: { ...state().user, name: "Changed elsewhere" },
  });
  assert.equal(
    reopened.project(state()).story.taskNotes["0:n"],
    "offline note",
  );
  online = true;
  await reopened.flush();
  assert.equal(reopened.status, "saved");
  assert.equal(profileOnly(reopened.project(state())).story, undefined);
  reopened.close();
});
test("same-field conflict retains local text, lets unrelated outings sync, and explicitly keeps local edits", async () => {
  const a = record(),
    b = record();
  await call("POST", "/outings/operations", create(a), 1);
  await call("POST", "/outings/operations", create(b), 1);
  const disk = new Map(),
    storage = {
      read: async () => undefined,
      write: async (k: string, v: any) => disk.set(k, structuredClone(v)),
      remove: async () => {},
    };
  let online = true;
  const request = async (method: string, body: any) => {
    const response = await call(
      method,
      method === "GET" ? "/outings" : "/outings/operations",
      body,
      1,
    );
    if (response.statusCode >= 400)
      throw Object.assign(Error("API"), { status: response.statusCode });
    return response.json();
  };
  const engine = new OutingSync({
    uid: users[1].uid,
    storage,
    request,
    available: () => online,
  });
  await engine.open(state());
  engine.cache.selected = a.id;
  let before = engine.project(state());
  online = false;
  engine.edit(before, {
    ...before,
    story: { ...before.story, taskNotes: { note: "local" } },
  });
  await engine.checkpoint;
  await call(
    "POST",
    "/outings/operations",
    patch(a.id, [{ path: ["story", "taskNotes", "note"], after: "cloud" }]),
    1,
  );
  engine.cache.selected = b.id;
  before = engine.project(state());
  engine.edit(before, {
    ...before,
    story: { ...before.story, taskNotes: { other: "unrelated" } },
  });
  await engine.checkpoint;
  online = true;
  await engine.flush();
  assert.equal(engine.status, "conflict");
  assert.equal(
    engine.view().find((r: any) => r.id === a.id).story.taskNotes.note,
    "local",
  );
  assert.equal(
    (await call("GET", "/outings", undefined, 1))
      .json()
      .outings.find((r: any) => r.id === b.id).story.taskNotes.other,
    "unrelated",
  );
  await engine.resolve("local");
  assert.equal(engine.status, "saved");
  assert.equal(
    (await call("GET", "/outings", undefined, 1))
      .json()
      .outings.find((r: any) => r.id === a.id).story.taskNotes.note,
    "local",
  );
  engine.close();
});
test("dirty legacy notes remain visible for explicit conflict review instead of being dropped on migration", async () => {
  const r = record();
  await call("POST", "/outings/operations", create(r), 1);
  const local = { ...r.story, taskNotes: { note: "legacy offline text" } };
  const engine = new OutingSync({
    uid: users[1].uid,
    storage: {
      read: async () => undefined,
      write: async () => {},
      remove: async () => {},
    },
    request: async (method: string, body: any) => {
      const response = await call(
        method,
        method === "GET" ? "/outings" : "/outings/operations",
        body,
        1,
      );
      if (response.statusCode >= 400)
        throw Object.assign(Error("API"), { status: response.statusCode });
      return response.json();
    },
  });
  await engine.open(state(local), true);
  assert.equal(engine.status, "conflict");
  assert.equal(
    engine.project(state()).story.taskNotes.note,
    "legacy offline text",
  );
  await engine.resolve("cloud");
  assert.equal(engine.status, "saved");
  assert.equal(engine.project(state()).story.taskNotes, undefined);
  engine.close();
});

test("patch failures leave the original record unchanged", () => {
  const r = record();
  assert.throws(() =>
    patchOuting(r as any, [{ path: ["tripXp"], before: 1, after: 2 }]),
  );
  assert.equal(r.tripXp, 0);
});
test("deletion immediately removes outings and receipts and blocks queued writes", async () => {
  const r = record();
  await call("POST", "/outings/operations", create(r), 1);
  assert.equal(
    (await call("DELETE", "", { confirm: "DELETE" }, 1)).statusCode,
    202,
  );
  assert.equal(
    (await pool.query("SELECT 1 FROM outings WHERE user_id=$1", [users[1].uid]))
      .rowCount,
    0,
  );
  assert.equal(
    (
      await pool.query("SELECT 1 FROM outing_operations WHERE user_id=$1", [
        users[1].uid,
      ])
    ).rowCount,
    0,
  );
  assert.equal(
    (await call("POST", "/outings/operations", create(record()), 1)).statusCode,
    410,
  );
});
