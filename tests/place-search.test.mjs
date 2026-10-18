import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import React from "react";
import { create, act } from "react-test-renderer";
const require = createRequire(import.meta.url);
const data = (code) =>
  "data:text/javascript;base64," + Buffer.from(code).toString("base64");
async function load() {
  let code = ts.transpileModule(
    await readFile(new URL("../src/PlaceSearch.tsx", import.meta.url), "utf8"),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText;
  const adapters = {
    "./places": data(
      "export const searchPlace=(...args)=>globalThis.__placeSearch(...args)",
    ),
    "./ui": data("export const Arrow=()=>null"),
    react: pathToFileURL(require.resolve("react")).href,
    "react/jsx-runtime": pathToFileURL(require.resolve("react/jsx-runtime"))
      .href,
  };
  for (const [from, to] of Object.entries(adapters))
    code = code
      .replaceAll("from " + JSON.stringify(from), "from " + JSON.stringify(to))
      .replaceAll("from '" + from + "'", "from " + JSON.stringify(to));
  const dir = await mkdtemp("/tmp/quavi-place-test-"),
    file = dir + "/search.mjs";
  await writeFile(file, code);
  return {
    ...(await import(pathToFileURL(file).href)),
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}
const hits = [
  {
    id: "one",
    name: "Springfield",
    address: "Massachusetts, United States",
    ll: { lat: 42.1, lng: -72.6 },
    kind: "City",
  },
  {
    id: "two",
    name: "Springfield",
    address: "Illinois, United States",
    ll: { lat: 39.8, lng: -89.6 },
    kind: "City",
  },
];
test("search presents disambiguating addresses and only routes the explicitly selected coordinates", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.window = globalThis;
  globalThis.__placeSearch = async () => hits;
  const { PlaceSearch, cleanup } = await load();
  let selected = [],
    renderer;
  try {
    await act(async () => {
      renderer = create(
        React.createElement(PlaceSearch, {
          value: "Springfield",
          onChange: () => {},
          onChoose: (h) => selected.push(h),
          near: { lat: 40, lng: -74 },
        }),
      );
    });
    await act(async () => {
      await renderer.root
        .findByType("form")
        .props.onSubmit({ preventDefault() {} });
    });
    assert.equal(
      selected.length,
      0,
      "submitting text must not silently pick the first hit",
    );
    assert.match(JSON.stringify(renderer.toJSON()), /Massachusetts/);
    assert.match(JSON.stringify(renderer.toJSON()), /Illinois/);
    await act(async () =>
      renderer.root
        .findAll((n) => n.props.role === "option")[1]
        .props.onClick(),
    );
    assert.equal(selected[0].id, "two");
    assert.equal(selected[0].ll.lng, -89.6);
  } finally {
    await act(async () => renderer?.unmount());
    delete globalThis.__placeSearch;
    await cleanup();
  }
});
test("late responses cannot replace a newer query and clearing aborts suggestions", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.window = globalThis;
  let release;
  globalThis.__placeSearch = async (q) =>
    q === "old" ? new Promise((r) => (release = r)) : hits;
  const { PlaceSearch, cleanup } = await load();
  let renderer,
    value = "old";
  const props = () => ({
    value,
    onChange: (v) => (value = v),
    onChoose: () => {},
    near: { lat: 40, lng: -74 },
  });
  try {
    await act(async () => {
      renderer = create(React.createElement(PlaceSearch, props()));
    });
    let pending;
    await act(async () => {
      pending = renderer.root
        .findByType("form")
        .props.onSubmit({ preventDefault() {} });
    });
    value = "new";
    await act(async () =>
      renderer.update(React.createElement(PlaceSearch, props())),
    );
    await act(async () => {
      await renderer.root
        .findByType("form")
        .props.onSubmit({ preventDefault() {} });
    });
    await act(async () => {
      release([{ ...hits[0], name: "Stale result" }]);
      await pending;
    });
    assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /Stale result/);
    await act(async () =>
      renderer.root
        .findAllByType("button")
        .find((b) => b.props["aria-label"] === "Clear search")
        .props.onClick(),
    );
    assert.equal(value, "");
  } finally {
    await act(async () => renderer?.unmount());
    delete globalThis.__placeSearch;
    await cleanup();
  }
});
