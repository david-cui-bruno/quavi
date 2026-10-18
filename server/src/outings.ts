import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type pg from "pg";
import { z } from "zod";
import { storySchema, inspectState } from "./state-schema.js";
import { scrubGoogleContent } from "./google-retention.js";

const safeKey = z
  .string()
  .min(1)
  .max(200)
  .refine((s) => !["__proto__", "constructor", "prototype"].includes(s));
const flags = z
  .record(safeKey, z.boolean())
  .refine((v) => Object.keys(v).length <= 2000);
export const outingSchema = z
  .object({
    id: safeKey,
    story: storySchema,
    status: z.enum(["planned", "active", "paused", "completed", "abandoned"]),
    chapter: z.number().int().min(0).max(11),
    tasks: flags,
    collected: flags,
    tripXp: z.number().int().min(0).max(10000000),
    inShelf: z.boolean(),
    inLibrary: z.boolean(),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.story.id !== v.id || v.chapter >= v.story.chapters.length)
      c.addIssue({
        code: "custom",
        message: "Invalid outing chapter or identity",
      });
  });
export type Outing = z.infer<typeof outingSchema>;
const changeSchema = z
  .object({
    path: z.array(safeKey).min(1).max(8),
    before: z.unknown().optional(),
    after: z.unknown().optional(),
  })
  .strict();
export const operationSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("create"),
      operationId: z.uuid(),
      outingId: safeKey,
      record: outingSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("patch"),
      operationId: z.uuid(),
      outingId: safeKey,
      changes: z.array(changeSchema).min(1).max(200),
    })
    .strict(),
]);
export type Operation = z.infer<typeof operationSchema>;
const fail = (statusCode: number, message: string) =>
  Object.assign(new Error(message), { statusCode });
function canonical(value: unknown): string {
  function ordered(v: any): any {
    if (Array.isArray(v)) return v.map(ordered);
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => [k, ordered(v[k])]),
      );
    return v;
  }
  return JSON.stringify(ordered(value));
}
const transitions: Record<Outing["status"], Outing["status"][]> = {
  planned: ["active", "abandoned"],
  active: ["paused", "completed", "abandoned"],
  paused: ["active", "completed", "abandoned"],
  completed: [],
  abandoned: [],
};
export function patchOuting(
  current: Outing,
  changes: z.infer<typeof changeSchema>[],
) {
  const result = structuredClone(current);
  for (const { path, before, after } of changes) {
    if (
      ![
        "story",
        "status",
        "chapter",
        "tasks",
        "collected",
        "tripXp",
        "inShelf",
        "inLibrary",
      ].includes(path[0]) ||
      (path[0] === "story" && (path[1] === "id" || path.length === 1))
    )
      throw fail(400, "Invalid outing change");
    let parent: Record<string, any> = result;
    for (const key of path.slice(0, -1)) {
      if (parent[key] === undefined) parent[key] = {};
      if (
        !parent[key] ||
        typeof parent[key] !== "object" ||
        Array.isArray(parent[key])
      )
        throw fail(409, "Outing changed on another device");
      parent = parent[key];
    }
    const key = path.at(-1)!;
    if (isDeepStrictEqual(parent[key], after)) continue;
    if (!isDeepStrictEqual(parent[key], before))
      throw fail(409, "Outing changed on another device");
    if (after === undefined) delete parent[key];
    else parent[key] = after;
  }
  const parsed = outingSchema.parse(result);
  if (
    current.status !== parsed.status &&
    !transitions[current.status].includes(parsed.status)
  )
    throw fail(409, "Outing lifecycle changed on another device");
  return parsed;
}

/** Runs inside the account lock/transaction. Copies legacy saves once; never overwrites a newer outing. */
export async function ensureOutings(db: pg.PoolClient, uid: string) {
  await db.query("SAVEPOINT outing_migration");
  try {
    await migrateLegacy(db, uid);
    await db.query("RELEASE SAVEPOINT outing_migration");
  } catch (error) {
    await db.query("ROLLBACK TO SAVEPOINT outing_migration");
    await db.query("RELEASE SAVEPOINT outing_migration");
    throw error;
  }
}
async function migrateLegacy(db: pg.PoolClient, uid: string) {
  const marker = await db.query(
    "INSERT INTO outing_accounts(user_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING user_id",
    [uid],
  );
  if (!marker.rowCount) return;
  const {
    rows: [legacy],
  } = await db.query("SELECT document FROM user_state WHERE user_id=$1", [uid]);
  if (!legacy) return;
  const s = legacy.document,
    stories = new Map<string, any>();
  for (const story of [
    ...Object.values(s.library ?? {}),
    ...(s.shelf ?? []),
    ...(s.story ? [s.story] : []),
  ] as any[])
    stories.set(story.id, story);
  for (const story of stories.values()) {
    const tasks = Object.fromEntries(
      Object.entries(s.game?.done ?? {})
        .filter(([k]) => k.startsWith(story.id + ":"))
        .flatMap(([k, ids]) =>
          (ids as string[]).map((id) => [
            k.slice(story.id.length + 1) + "/" + id,
            true,
          ]),
        ),
    );
    const record = outingSchema.parse(
      scrubGoogleContent({
        id: story.id,
        story,
        status:
          story.status === "done"
            ? "completed"
            : story.status === "active"
              ? "paused"
              : "planned",
        chapter:
          s.story?.id === story.id
            ? Math.min(s.chapter ?? 0, story.chapters.length - 1)
            : 0,
        tasks,
        collected: Object.fromEntries(
          (s.game?.collected?.[story.id] ?? []).map((n: number) => [
            String(n),
            true,
          ]),
        ),
        tripXp: s.game?.tripXp?.[story.id] ?? 0,
        inShelf: (s.shelf ?? []).some((x: any) => x.id === story.id),
        inLibrary: !!s.library?.[story.id],
      }),
    );
    await db.query(
      "INSERT INTO outings(user_id,id,document) VALUES($1,$2,$3)",
      [uid, record.id, record],
    );
  }
}
export async function listOutings(db: pg.PoolClient, uid: string) {
  await ensureOutings(db, uid);
  const { rows } = await db.query(
    "SELECT document,revision,updated_at FROM outings WHERE user_id=$1 ORDER BY updated_at DESC",
    [uid],
  );
  return rows.map((row) => ({
    ...row.document,
    revision: row.revision,
    updatedAt: row.updated_at.toISOString(),
  }));
}
export async function applyOutingOperation(
  db: pg.PoolClient,
  uid: string,
  input: unknown,
) {
  // Scrub only record values, not the patch envelope: preserve before/after comparison semantics.
  const op = operationSchema.parse(input);
  inspectState(op);
  const fingerprint = createHash("sha256").update(canonical(op)).digest("hex");
  await ensureOutings(db, uid);
  const {
    rows: [receipt],
  } = await db.query(
    "SELECT fingerprint FROM outing_operations WHERE user_id=$1 AND operation_id=$2",
    [uid, op.operationId],
  );
  const {
    rows: [row],
  } = await db.query(
    "SELECT document,revision,updated_at FROM outings WHERE user_id=$1 AND id=$2",
    [uid, op.outingId],
  );
  if (receipt) {
    if (receipt.fingerprint !== fingerprint)
      throw fail(409, "Operation ID already used");
    return {
      ...row.document,
      revision: row.revision,
      updatedAt: row.updated_at.toISOString(),
    };
  }
  let next: Outing;
  if (op.kind === "create") {
    if (op.record.id !== op.outingId)
      throw fail(400, "Invalid outing identity");
    next = outingSchema.parse(scrubGoogleContent(op.record));
    // Two devices migrating an identical legacy story converge without creating duplicates.
    if (row && !isDeepStrictEqual(row.document, next))
      throw fail(409, "Outing already exists with different progress");
    if (!row) {
      const count = await db.query(
        "SELECT count(*)::integer AS n FROM outings WHERE user_id=$1",
        [uid],
      );
      if (count.rows[0].n >= 500) throw fail(413, "Outing storage is full");
    }
  } else {
    if (!row) throw fail(404, "Outing not found");
    next = outingSchema.parse(
      scrubGoogleContent(patchOuting(row.document, op.changes)),
    );
  }
  if (Buffer.byteLength(JSON.stringify(next)) > 128 * 1024)
    throw fail(413, "Outing is too large");
  const usage = await db.query(
    "SELECT coalesce(sum(octet_length(document::text)),0)::bigint AS bytes FROM outings WHERE user_id=$1 AND id<>$2",
    [uid, op.outingId],
  );
  if (
    Number(usage.rows[0].bytes) + Buffer.byteLength(JSON.stringify(next)) >
    8 * 1024 * 1024
  )
    throw fail(413, "Outing storage is full");
  const refs = inspectState(next);
  if (refs.length) {
    const owned = await db.query(
      "SELECT id FROM media_objects WHERE user_id=$1 AND uploaded_at IS NOT NULL AND id=ANY($2::uuid[])",
      [uid, refs],
    );
    if (owned.rowCount !== refs.length)
      throw fail(400, "Finish uploading your own photos before saving");
  }
  const {
    rows: [saved],
  } = await db.query(
    `INSERT INTO outings(user_id,id,document) VALUES($1,$2,$3)
    ON CONFLICT(user_id,id) DO UPDATE SET document=EXCLUDED.document,revision=outings.revision+1,updated_at=now() RETURNING document,revision,updated_at`,
    [uid, op.outingId, next],
  );
  await db.query(
    "INSERT INTO outing_operations(user_id,operation_id,outing_id,fingerprint) VALUES($1,$2,$3,$4)",
    [uid, op.operationId, op.outingId, fingerprint],
  );
  return {
    ...saved.document,
    revision: saved.revision,
    updatedAt: saved.updated_at.toISOString(),
  };
}
