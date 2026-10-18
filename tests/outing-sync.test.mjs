import test from "node:test";
import assert from "node:assert/strict";
import { OutingSync, diffOuting, extractOutings } from "../src/outing-sync.mjs";
const story = {
  id: "outing-fixture",
  title: "A walk",
  chapters: [{ place: "Test" }],
  moments: {},
  captions: [],
};
const state = () => ({
  story,
  chapter: 0,
  shelf: [],
  library: {},
  game: { done: {}, collected: {}, tripXp: {}, xp: 0 },
});
function memory() {
  const values = new Map();
  return {
    values,
    read: async (k) => structuredClone(values.get(k)),
    write: async (k, v) => {
      values.set(k, structuredClone(v));
    },
    remove: async (k) => {
      values.delete(k);
    },
  };
}
const tick = () => new Promise((r) => setImmediate(r));
test("diff merges new sibling notes at individual fields instead of replacing the entire note map", () => {
  assert.deepEqual(
    diffOuting({ story: {} }, { story: { taskNotes: { a: "one" } } }),
    [{ path: ["story", "taskNotes", "a"], after: "one" }],
  );
});
test("an edit during photo preparation is journaled separately and shares the durable uploaded reference", async () => {
  const storage = memory();
  let online = false,
    release,
    entered;
  const started = new Promise((r) => (entered = r)),
    gate = new Promise((r) => (release = r)),
    posted = [];
  const engine = new OutingSync({
    uid: "a",
    storage,
    available: () => online,
    request: async (method, body) => {
      if (method === "GET") return { outings: [] };
      posted.push(structuredClone(body));
      return {
        ...(body.kind === "create" ? body.record : extractOutings(state())[0]),
        revision: 1,
      };
    },
    prepare: async (op) => {
      entered();
      await gate;
      return JSON.parse(
        JSON.stringify(op).replaceAll(
          "data:image/png;base64,photo",
          "quavi-media:fixture",
        ),
      );
    },
  });
  const initial = state();
  initial.story = {
    ...story,
    taskPhotos: { photo: "data:image/png;base64,photo" },
  };
  await engine.open(initial);
  online = true;
  const flushing = engine.flush();
  await started;
  const before = engine.project(state());
  engine.edit(before, {
    ...before,
    story: { ...before.story, taskNotes: { a: "typed during upload" } },
  });
  await engine.checkpoint;
  release();
  await flushing;
  assert.equal(posted.length, 2);
  assert.equal(posted[0].record.story.taskPhotos.photo, "quavi-media:fixture");
  assert.equal(posted[1].kind, "patch");
  assert.equal(
    posted[1].changes.find((c) => c.path.at(-1) === "a").after,
    "typed during upload",
  );
  assert.doesNotMatch(JSON.stringify(storage.values.get("a")), /data:image/);
  engine.close();
});
test("device storage failure prevents a queued change being sent and reports unsaved data honestly", async () => {
  const storage = memory();
  let fail = false,
    calls = 0;
  const engine = new OutingSync({
    uid: "a",
    storage: {
      ...storage,
      write: async (k, v) => {
        if (fail) throw Error("full");
        await storage.write(k, v);
      },
    },
    request: async () => {
      calls++;
      return { outings: [] };
    },
    available: () => false,
  });
  await engine.open(state());
  fail = true;
  const before = engine.project(state());
  engine.edit(before, {
    ...before,
    story: { ...before.story, taskNotes: { a: "keep in memory" } },
  });
  await tick();
  assert.equal(engine.status, "storage-full");
  assert.equal(calls, 0);
  assert.equal(engine.project(state()).story.taskNotes.a, "keep in memory");
  engine.close();
});
test("account journals stay isolated and closing during a request cannot publish a stale account result", async () => {
  const storage = memory();
  let release,
    changes = 0,
    online = false;
  const gate = new Promise((r) => (release = r));
  const a = new OutingSync({
    uid: "a",
    storage,
    available: () => online,
    onChange: () => changes++,
    request: async () => {
      await gate;
      return { outings: [] };
    },
  });
  await a.open(state());
  const baseline = changes;
  online = true;
  const pending = a.flush();
  a.close();
  release();
  await pending;
  assert.equal(changes, baseline);
  const b = new OutingSync({
    uid: "b",
    storage,
    available: () => false,
    request: async () => ({ outings: [] }),
  });
  await b.open({ ...state(), story: undefined });
  assert.equal(b.project(state()).story, undefined);
  assert.ok(storage.values.get("a").records.length);
  b.close();
});
