import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import React from "react";
import { create, act } from "react-test-renderer";
const require = createRequire(import.meta.url),
  url = (code) =>
    "data:text/javascript;base64," + Buffer.from(code).toString("base64");
async function load() {
  let code = ts.transpileModule(
    await readFile(new URL("../src/social.tsx", import.meta.url), "utf8"),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText;
  const adapters = {
    "./cloud": url(
      "export const api=(...x)=>globalThis.__socialApi(...x);export const clearPhotoCache=()=>{}",
    ),
    "./store": url("export const useStore=()=>globalThis.__socialStore"),
    "./runtime": url(
      "export const useRuntime=()=>globalThis.__socialLife;export const runtime={get:()=>globalThis.__socialLife}",
    ),
    react: pathToFileURL(require.resolve("react")).href,
    "react/jsx-runtime": pathToFileURL(require.resolve("react/jsx-runtime"))
      .href,
  };
  for (const [from, to] of Object.entries(adapters))
    code = code
      .replaceAll("from " + JSON.stringify(from), "from " + JSON.stringify(to))
      .replaceAll("from '" + from + "'", "from " + JSON.stringify(to));
  const dir = await mkdtemp("/tmp/quavi-social-test-"),
    file = dir + "/social.mjs";
  await writeFile(file, code);
  return {
    ...(await import(pathToFileURL(file).href)),
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}
const summary = (id) => ({
  me: { id, handle: id, name: id },
  friends: [],
  incoming: [],
  outgoing: [],
  blocked: [],
  feed: [{ id: "private-" + id }],
  myPosts: [],
});
test("private circle is account-scoped and clears offline; stale account responses cannot repopulate it", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.window = { setInterval: () => 1, clearInterval: () => {} };
  globalThis.__socialLife = { active: true, online: true };
  globalThis.__socialStore = {
    account: { uid: "alice" },
    route: { name: "home" },
    saveForSharing: async () => {},
  };
  const pending = [];
  globalThis.__socialApi = (u) =>
    new Promise((resolve) => pending.push({ uid: u.uid, resolve }));
  const { SocialProvider, useSocial, cleanup } = await load();
  let value, r;
  function Probe() {
    value = useSocial();
    return null;
  }
  const tree = () =>
    React.createElement(SocialProvider, null, React.createElement(Probe));
  try {
    await act(async () => {
      r = create(tree());
    });
    await act(async () => pending.at(-1).resolve(summary("alice")));
    assert.equal(value.data.me.id, "alice");
    await act(async () => {
      globalThis.__socialLife = { active: true, online: false };
      r.update(tree());
    });
    assert.equal(value.data, null);
    await assert.rejects(
      () => value.command("/relationships", "POST", {}),
      /Connect/,
    );
    await act(async () => {
      globalThis.__socialLife = { active: true, online: true };
      globalThis.__socialStore = {
        ...globalThis.__socialStore,
        account: { uid: "bob" },
      };
      r.update(tree());
    });
    assert.equal(value.data, null);
    await act(async () => {
      for (const p of pending.filter((p) => p.uid === "alice"))
        p.resolve(summary("alice"));
    });
    assert.equal(value.data, null);
    await act(async () =>
      pending
        .filter((p) => p.uid === "bob")
        .at(-1)
        .resolve(summary("bob")),
    );
    assert.equal(value.data.me.id, "bob");
    await act(async () => {
      globalThis.__socialStore = { ...globalThis.__socialStore, account: null };
      r.update(tree());
    });
    assert.equal(value.data, null);
  } finally {
    await act(async () => r?.unmount());
    await cleanup();
  }
});
test("publishing waits for outing sync; failed saves cannot publish and commands keep server-confirmed state", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.window = { setInterval: () => 1, clearInterval: () => {} };
  globalThis.__socialLife = { active: true, online: true };
  let saves = 0,
    fail = true;
  globalThis.__socialStore = {
    account: { uid: "alice" },
    route: { name: "read" },
    saveForSharing: async () => {
      saves++;
      if (fail) throw Error("Wait for outing save");
    },
  };
  const sent = [];
  globalThis.__socialApi = async (u, path, method, body) => {
    sent.push({ path, method, body });
    return summary("alice");
  };
  const { SocialProvider, useSocial, cleanup } = await load();
  let value, r;
  function Probe() {
    value = useSocial();
    return null;
  }
  try {
    await act(async () => {
      r = create(
        React.createElement(SocialProvider, null, React.createElement(Probe)),
      );
    });
    await assert.rejects(() => value.publish("outing"), /Wait for outing save/);
    assert.equal(sent.filter((x) => x.method === "POST").length, 0);
    fail = false;
    await act(async () => value.publish("outing"));
    assert.equal(saves, 2);
    assert.deepEqual(
      sent.find((x) => x.method === "POST"),
      { path: "/social/posts", method: "POST", body: { outingId: "outing" } },
    );
    assert.equal(value.data.me.id, "alice");
  } finally {
    await act(async () => r?.unmount());
    await cleanup();
  }
});
