/** Shared deterministic demo task rules. No UI, network or client-supplied award amounts. */
export type Task = { id: string; text: string; xp: number; hint: string };
export type PlaceMeta = {
  lat: number;
  lng: number;
  badge: string;
  tasks: Task[];
};
type Prefs = { spend?: string; who?: string };
export type RuleStory = {
  chapters: { place: string; kind?: string; ll?: unknown }[];
  prefs?: Prefs;
};
const T = (id: string, text: string, xp: number, hint: string): Task => ({
  id,
  text,
  xp,
  hint,
});

export const PLACE_META: Record<string, PlaceMeta> = {
  "Corner Coffee": {
    lat: 40.7352,
    lng: -74.005,
    badge: "Pastry Scout",
    tasks: [
      T(
        "order",
        "Order your usual coffee, plus a pastry you’ve never tried",
        30,
        "Ask what came out of the oven today.",
      ),
      T(
        "barista",
        "Ask the barista what they’d order",
        20,
        "Bonus points if it’s not on the menu.",
      ),
      T("seat", "Find the best seat in the room", 10, "Window beats counter."),
    ],
  },
  "Paper & Pine": {
    lat: 40.7345,
    lng: -74.0035,
    badge: "Page Turner",
    tasks: [
      T(
        "cover",
        "Pick a book by its cover alone",
        30,
        "No flipping it over first.",
      ),
      T(
        "line",
        "Read one page, then a favorite line out loud (quietly)",
        20,
        "Whisper counts.",
      ),
      T(
        "note",
        "Leave a tiny note tucked in a book",
        20,
        "Someone will find it.",
      ),
    ],
  },
  "Abingdon Square": {
    lat: 40.7377,
    lng: -74.0057,
    badge: "Golden Hour",
    tasks: [
      T(
        "bench",
        "Find the bench with the best view",
        20,
        "Sit for one full minute.",
      ),
      T("orange", "Photograph something orange", 20, "Quavi would approve."),
      T("wave", "Wave at a stranger’s dog", 10, "Dogs count as strangers."),
    ],
  },
  "Little Gallery": {
    lat: 40.7349,
    lng: -74.0049,
    badge: "Art Brain",
    tasks: [
      T(
        "piece",
        "Pick one piece and decide what it’s about",
        30,
        "There are no wrong answers.",
      ),
      T(
        "title",
        "Give it a new title",
        20,
        "Make it funnier than the original.",
      ),
      T(
        "close",
        "Get close enough to see the brushstrokes",
        10,
        "Not too close, security is watching.",
      ),
    ],
  },
  "The Low Door": {
    lat: 40.7358,
    lng: -74.003,
    badge: "Regular",
    tasks: [
      T(
        "stool",
        "Claim one of the four stools",
        20,
        "Ask for the bartender’s pick.",
      ),
      T(
        "toast",
        "Make a toast to the plan that fell through",
        20,
        "Out loud, with feeling.",
      ),
      T(
        "card",
        "Learn one new drink word",
        20,
        "Pét-nat, orange wine, anything.",
      ),
    ],
  },
  "Elm Street Garden": {
    lat: 40.7339,
    lng: -74.0066,
    badge: "Night Gardener",
    tasks: [
      T("smell", "Smell three different plants", 20, "Mint is cheating."),
      T(
        "gate",
        "Find the hidden courtyard gate",
        30,
        "Look for the green door.",
      ),
      T("quiet", "Stay silent for sixty seconds", 20, "Listen to the city."),
    ],
  },
  "Pixel Palace": {
    lat: 40.7333,
    lng: -74.0002,
    badge: "High Scorer",
    tasks: [
      T("coins", "Spend ten quarters on one game", 20, "Pick something dumb."),
      T("score", "Beat your own high score", 30, "Or a stranger’s."),
      T("snacks", "Winner picks the snacks", 20, "Loser carries them."),
    ],
  },
  "Dumpling Window": {
    lat: 40.735,
    lng: -74.001,
    badge: "One More Dumpling",
    tasks: [
      T(
        "extra",
        "Order one more than you think you should",
        30,
        "You’ll finish it.",
      ),
      T(
        "sauce",
        "Invent your own dipping sauce",
        20,
        "Vinegar, chili, soy, ratios are yours.",
      ),
      T("window", "Eat them standing at the window", 10, "The correct way."),
    ],
  },
  "Roof 44": {
    lat: 40.7372,
    lng: -74.0016,
    badge: "Skyline Said It",
    tasks: [
      T(
        "view",
        "Find your favorite building in the skyline",
        20,
        "Name it something.",
      ),
      T(
        "say",
        "Say the thing you’ve been meaning to say",
        30,
        "To a friend or to the wind.",
      ),
      T(
        "photo",
        "Take one photo and put your phone away",
        20,
        "Then just look.",
      ),
    ],
  },
};
export function categoryTasks(place: string): Task[] {
  const p = place.toLowerCase();
  if (/coffee|café|cafe|tea|juice|sweet|bakery|slice|taco|dumpling/.test(p))
    return [
      T(
        "order",
        "Order something you’ve never tried",
        30,
        "Ask what’s popular.",
      ),
      T(
        "chat",
        "Ask the person at the counter their favorite",
        20,
        "Bonus points for a story.",
      ),
      T("seat", "Pick the best seat", 10, "Trust your gut."),
    ];
  if (/book|record|plant|stationery|zine|shop/.test(p))
    return [
      T(
        "pick",
        "Pick one thing for no reason at all",
        30,
        "Don’t overthink it.",
      ),
      T("ask", "Ask the owner for a recommendation", 20, "They love this."),
      T("photo", "Photograph the best shelf", 10, "Mind the glare."),
    ];
  if (/gallery|mural/.test(p))
    return [
      T(
        "piece",
        "Pick one piece and decide what it’s about",
        30,
        "No wrong answers.",
      ),
      T("title", "Give it a new title", 20, "Make it funnier."),
      T("step", "Step back until it changes", 10, "Distance is a filter."),
    ];
  if (/garden|park|pier|bench|stoop|path|block|roof|bridge|view|garage/.test(p))
    return [
      T("sit", "Sit for one full minute", 20, "Phone down."),
      T(
        "photo",
        "Photograph something you’d usually walk past",
        20,
        "Look up.",
      ),
      T("breathe", "Take three slow breaths", 10, "Out the nose."),
    ];
  return [
    T(
      "look",
      "Notice three details you’d usually miss",
      20,
      "Floor, ceiling, door.",
    ),
    T("talk", "Say hi to someone", 20, "Small talk counts."),
    T("photo", "Take one photo", 10, "Make it count."),
  ];
}
export function adaptTasks(tasks: Task[], p?: Prefs): Task[] {
  if (!p) return tasks;
  const out = [...tasks];
  const friends = p.who === "With friends";
  if (p.spend === "$$ Treat myself") {
    out[0] = T(
      "splurge",
      "Buy the thing you’d normally talk yourself out of",
      30,
      "Within reason, but really do it.",
    );
    out[1] = T(
      "gift",
      "Pick up a small something for someone you love",
      20,
      "It doesn’t have to be big.",
    );
  } else if (p.spend === "$ Low")
    out[0] = T(
      "budget",
      "Find the best thing here for under $10",
      20,
      "Cheap and good counts double.",
    );
  if (friends) {
    if (p.spend !== "$$ Treat myself" && p.spend !== "$ Low")
      out[0] = T(
        "vote",
        "Everyone suggests something, then vote on it",
        30,
        "Majority wins, no appeals.",
      );
    out[1] = T(
      "swap",
      "Each person picks something for someone else",
      20,
      "No peeking until it’s ready.",
    );
    out[2] = T("photo", "Take a group photo", 10, "Everyone in the frame.");
  }
  return out;
}
export const TRIP_XP_CAP = 25;
export const DAILY_XP_CAP = 100;
export function rewardPlan(story: RuleStory) {
  const chapters = story.chapters.map((c) => {
    const known = !c.ll ? PLACE_META[c.place] : undefined;
    return {
      badge: known?.badge ?? c.place.split(" ").slice(-1)[0] + " Fan",
      tasks: adaptTasks(
        known?.tasks ?? categoryTasks(`${c.place} ${c.kind ?? ""}`),
        story.prefs,
      ),
    };
  });
  const total = chapters.flatMap((c) => c.tasks).reduce((n, t) => n + t.xp, 0);
  return chapters.map((c) => ({
    ...c,
    tasks: c.tasks.map((t) => ({
      ...t,
      xp: Math.max(1, Math.floor((TRIP_XP_CAP * t.xp) / (total || 1))),
    })),
  }));
}
