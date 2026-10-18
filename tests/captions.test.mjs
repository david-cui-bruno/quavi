import test from "node:test";
import assert from "node:assert/strict";
import { groundedCaptions } from "../src/captions.mjs";
const story = () => ({
  chapters: [
    { place: "The café" },
    { place: "The gallery" },
    { place: "The garden" },
  ],
  moments: {},
  arrivedStops: [0],
});
test("captions distinguish recorded arrivals from unvisited planned stops", () => {
  for (const tone of ["Cozy", "Funny", "Dramatic"]) {
    const caps = groundedCaptions(story(), [], tone);
    assert(!caps[0].startsWith("On the plan:"));
    assert.equal(caps[1], "On the plan: The gallery.");
    assert.equal(caps[2], "On the plan: The garden.");
    assert(
      !/bought|met|stood up|regret|friend|loved|delicious/i.test(
        caps.join(" "),
      ),
    );
  }
});
test("personal moments and task notes ground captions without invented paraphrases or tone changes to facts", () => {
  const s = story();
  s.moments[0] = { note: "  I ordered cardamom tea.  " };
  const notes = [
    { chapter: 0, note: "Other note" },
    { chapter: 1, note: "The blue painting stood out." },
  ];
  for (const tone of ["Cozy", "Funny", "Dramatic"])
    assert.deepEqual(groundedCaptions(s, notes, tone), [
      "The café: I ordered cardamom tea.",
      "The gallery: The blue painting stood out.",
      "On the plan: The garden.",
    ]);
});
test("blank notes do not become evidence and long Unicode notes are bounded without broken characters", () => {
  const s = story();
  s.moments[0] = { note: "  " };
  assert.equal(
    groundedCaptions(s, [{ chapter: 1, note: "   " }])[1],
    "On the plan: The gallery.",
  );
  s.moments[0] = { note: "☕".repeat(500) };
  const caption = groundedCaptions(s)[0];
  assert(caption.endsWith("…"));
  assert(Array.from(caption).length < 300);
  assert(!caption.includes("\uFFFD"));
});
