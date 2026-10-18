import { z } from "zod";
const text = z.string().max(4000);
const strings = z.array(text).max(1000);
const record = <T extends z.ZodType>(schema: T) =>
  z.record(z.string().max(200), schema);
const avatar = z.object({ color: z.string().max(30) }).passthrough();
const ll = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  })
  .strict();
const chapter = z
  .object({
    title: text,
    place: text,
    meta: text,
    mins: z.number().min(0).max(1440),
    desc: text,
    walk: text,
    persona: text,
    color: text,
    at: z.tuple([z.number(), z.number()]),
    ll: ll.optional(),
    kind: text.optional(),
    alts: z
      .array(
        z
          .object({
            place: text,
            meta: text,
            persona: text,
            color: text,
            ll: ll.optional(),
            kind: text.optional(),
          })
          .passthrough(),
      )
      .max(20),
  })
  .passthrough();
export const storySchema = z
  .object({
    origin: ll.optional(),
    estimatedMinutes: z.number().int().min(1).max(1440).optional(),
    timeBudgetMinutes: z
      .union([z.literal(30), z.literal(60), z.literal(120)])
      .optional(),
    walking: z
      .object({
        legs: z
          .array(
            z
              .object({
                distance: z.number().min(0).max(50000),
                duration: z.number().min(0).max(86400),
              })
              .strict(),
          )
          .min(1)
          .max(12),
        distance: z.number().min(0).max(50000),
        duration: z.number().min(0).max(86400),
        checkedAt: z.iso.datetime(),
        provider: text,
      })
      .strict()
      .optional(),
    source: z
      .object({
        provider: text,
        updatedAt: z.iso.datetime(),
        attributionURL: z.url().refine((v) => new URL(v).protocol === "https:"),
      })
      .strict()
      .optional(),
    id: z.string().max(200),
    title: text,
    openingId: text,
    premise: text,
    chapters: z.array(chapter).min(1).max(12),
    moments: record(
      z
        .object({
          note: text.optional(),
          feeling: text.optional(),
          img: text.optional(),
        })
        .strict(),
    ),
    tone: z.enum(["Cozy", "Funny", "Dramatic"]),
    captions: z.array(text).max(12),
    date: text,
    taskPhotos: record(text).optional(),
    taskNotes: record(text).optional(),
  })
  .passthrough();
export const appStateSchema = z
  .object({
    user: z
      .object({
        onboarding: z.enum(["about", "interests", "customize", "complete"]).optional(),
        name: z.string().max(24),
        avatar,
        interests: z
          .array(z.enum(["food", "cozy", "art", "air", "fun", "gems"]))
          .max(6),
        neighborhood: z.string().max(200),
        authed: z.boolean(),
        age21: z.boolean().optional(),
        who: z.enum(["Solo", "With friends"]).optional(),
      })
      .strict(),
    friends: z
      .array(z.object({ id: text, name: z.string().max(100) }).strict())
      .max(500),
    demoRedemptions: z
      .array(z.object({ offerId: text, redeemedAt: text }).strict())
      .max(100),
    mood: text.optional(),
    story: storySchema.optional(),
    chapter: z.number().int().min(0).max(12),
    shelf: z.array(storySchema).max(200),
    lists: record(strings),
    library: record(storySchema),
    game: z
      .object({
        xp: z.number().int().min(0).max(10000000),
        coins: z.number().int().min(0).max(10000000),
        streak: z.number().int().min(0).max(10000),
        badges: strings,
        done: record(strings),
        collected: record(z.array(z.number().int().min(0).max(1000)).max(1000)),
        tripXp: record(z.number().int().min(0).max(10000000)),
      })
      .strict(),
  })
  .strict();
export function inspectState(state: unknown) {
  const refs = new Set<string>();
  let nodes = 0;
  function walk(value: unknown, depth: number) {
    if (++nodes > 30000 || depth > 24)
      throw Object.assign(new Error("Save is too complex"), {
        statusCode: 400,
      });
    if (typeof value === "string") {
      if (value.length > 4000)
        throw Object.assign(new Error("Text is too long"), { statusCode: 400 });
      if (value.startsWith("data:"))
        throw Object.assign(new Error("Upload photos before saving"), {
          statusCode: 400,
        });
      if (value.startsWith("quavi-media:")) {
        const id = z.uuid().parse(value.slice(12));
        refs.add(id);
      }
    } else if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) {
        if (["__proto__", "prototype", "constructor"].includes(key))
          throw Object.assign(new Error("Invalid key"), { statusCode: 400 });
        walk(item, depth + 1);
      }
    }
  }
  walk(state, 0);
  return [...refs];
}
