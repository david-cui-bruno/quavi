import type pg from "pg";
import { randomUUID, randomBytes } from "node:crypto";
import { z } from "zod";
import { rewardPlan, type RuleStory } from "./reward-rules.js";
import { ensureOutings } from "./outings.js";
import type { Outing } from "./outings.js";
export class SocialError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
const fail = (code: number, message: string) => new SocialError(code, message);
const handle = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9_]{2,23}$/);
const publicId = z.uuid();
const person = (p: any) => ({
  id: p.public_id,
  handle: p.handle,
  name: p.name,
});
export async function ensureSocial(db: pg.PoolClient, uid: string) {
  const state = await db.query(
    "SELECT document AS state FROM user_state WHERE user_id=$1",
    [uid],
  );
  const name = String(
    state.rows[0]?.state?.user?.name || "Quavi explorer",
  ).slice(0, 40);
  await db.query(
    "INSERT INTO social_profiles(user_id,public_id,handle,name) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET name=EXCLUDED.name",
    [uid, randomUUID(), "quavi_" + randomBytes(8).toString("hex"), name],
  );
  return (
    await db.query("SELECT * FROM social_profiles WHERE user_id=$1", [uid])
  ).rows[0];
}
async function blocked(db: pg.PoolClient, a: string, b: string) {
  return !!(
    await db.query(
      "SELECT 1 FROM social_blocks WHERE (user_id=$1 AND target_id=$2) OR (user_id=$2 AND target_id=$1)",
      [a, b],
    )
  ).rowCount;
}
async function target(db: pg.PoolClient, uid: string, id: unknown) {
  const p = (
    await db.query("SELECT * FROM social_profiles WHERE public_id=$1", [
      publicId.parse(id),
    ])
  ).rows[0];
  if (!p || p.user_id === uid) throw fail(404, "Person unavailable");
  return p;
}
async function pair(db: pg.PoolClient, a: string, b: string) {
  const ids = [a, b].sort();
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    "social:" + ids.join(":"),
  ]);
  return ids;
}
const visible = `(p.user_id=$1 OR (EXISTS(SELECT 1 FROM social_relationships r WHERE r.low_id=least(p.user_id COLLATE "C",$1) AND r.high_id=greatest(p.user_id COLLATE "C",$1) AND r.state='accepted') AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.user_id=$1 AND b.target_id=p.user_id) OR (b.user_id=p.user_id AND b.target_id=$1))))`;
const postsSql = `SELECT p.*,s.public_id,s.handle,s.name,o.document FROM social_posts p JOIN social_profiles s ON s.user_id=p.user_id JOIN outings o ON o.user_id=p.user_id AND o.id=p.outing_id WHERE o.document->>'status'='completed' AND o.document->>'inShelf'='true' AND ${visible}`;
export async function socialState(db: pg.PoolClient, uid: string) {
  const me = await ensureSocial(db, uid);
  const relations = await db.query(
    `SELECT s.*,r.state,r.requester FROM social_relationships r JOIN social_profiles s ON s.user_id=CASE WHEN r.low_id=$1 THEN r.high_id ELSE r.low_id END WHERE (r.low_id=$1 OR r.high_id=$1) AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.user_id=$1 AND b.target_id=s.user_id) OR (b.user_id=s.user_id AND b.target_id=$1)) ORDER BY r.created_at DESC`,
    [uid],
  );
  const blocks = await db.query(
    "SELECT s.* FROM social_blocks b JOIN social_profiles s ON s.user_id=b.target_id WHERE b.user_id=$1",
    [uid],
  );
  const posts = await db.query(
    postsSql + " ORDER BY p.created_at DESC,p.id LIMIT 50",
    [uid],
  );
  const mine = await db.query(
    "SELECT id,outing_id FROM social_posts WHERE user_id=$1",
    [uid],
  );
  return {
    me: person(me),
    friends: relations.rows.filter((r) => r.state === "accepted").map(person),
    incoming: relations.rows
      .filter((r) => r.state === "pending" && r.requester !== uid)
      .map(person),
    outgoing: relations.rows
      .filter((r) => r.state === "pending" && r.requester === uid)
      .map(person),
    blocked: blocks.rows.map(person),
    myPosts: mine.rows.map((r) => ({ id: r.id, outingId: r.outing_id })),
    feed: posts.rows.map((p) => ({
      id: p.id,
      title: p.document.story.title,
      date: p.document.story.date,
      chapters: p.document.story.chapters.map((c: any) => ({ place: c.place })),
      author: p.user_id === uid ? "You" : p.name,
      ownerId: p.public_id,
      handle: p.handle,
      outingId: p.user_id === uid ? p.outing_id : undefined,
    })),
  };
}
export async function setHandle(
  db: pg.PoolClient,
  uid: string,
  input: unknown,
) {
  const v = z.object({ handle }).strict().parse(input);
  await ensureSocial(db, uid);
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    "handle:" + v.handle,
  ]);
  if (
    (
      await db.query(
        "SELECT 1 FROM social_profiles WHERE handle=$1 AND user_id<>$2",
        [v.handle, uid],
      )
    ).rowCount
  )
    throw fail(409, "That handle is taken. Try another.");
  await db.query("UPDATE social_profiles SET handle=$2 WHERE user_id=$1", [
    uid,
    v.handle,
  ]);
  return socialState(db, uid);
}
export async function lookup(db: pg.PoolClient, uid: string, input: unknown) {
  const v = z.object({ handle }).strict().parse(input);
  const p = (
    await db.query(
      "SELECT * FROM social_profiles WHERE handle=$1 AND user_id<>$2",
      [v.handle, uid],
    )
  ).rows[0];
  return {
    people: p && !(await blocked(db, uid, p.user_id)) ? [person(p)] : [],
  };
}
export async function relationship(
  db: pg.PoolClient,
  uid: string,
  input: unknown,
) {
  const op = z
    .object({
      targetId: publicId,
      action: z.enum([
        "request",
        "accept",
        "decline",
        "cancel",
        "remove",
        "block",
        "unblock",
      ]),
    })
    .strict()
    .parse(input);
  await ensureSocial(db, uid);
  const p = await target(db, uid, op.targetId),
    [low, high] = await pair(db, uid, p.user_id);
  if (op.action === "block") {
    await db.query(
      "INSERT INTO social_blocks(user_id,target_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [uid, p.user_id],
    );
    await db.query(
      "DELETE FROM social_relationships WHERE low_id=$1 AND high_id=$2",
      [low, high],
    );
    return socialState(db, uid);
  }
  if (op.action === "unblock") {
    await db.query(
      "DELETE FROM social_blocks WHERE user_id=$1 AND target_id=$2",
      [uid, p.user_id],
    );
    return socialState(db, uid);
  }
  if (await blocked(db, uid, p.user_id)) throw fail(404, "Person unavailable");
  const existing = (
    await db.query(
      "SELECT * FROM social_relationships WHERE low_id=$1 AND high_id=$2",
      [low, high],
    )
  ).rows[0];
  if (op.action === "request") {
    const count = await db.query(
      "SELECT count(*)::integer AS n FROM social_relationships WHERE (low_id=$1 OR high_id=$1)",
      [uid],
    );
    if (count.rows[0].n >= 500 && !existing)
      throw fail(422, "Your circle is full. Remove a request or friend first.");
    if (!existing)
      await db.query(
        "INSERT INTO social_relationships(low_id,high_id,requester,state) VALUES($1,$2,$3,'pending')",
        [low, high, uid],
      );
  } else if (op.action === "accept") {
    if (!existing || existing.requester === uid)
      throw fail(409, "Only the recipient can accept this request.");
    await db.query(
      "UPDATE social_relationships SET state='accepted' WHERE low_id=$1 AND high_id=$2",
      [low, high],
    );
  } else if (existing) {
    if (
      op.action === "decline" &&
      (existing.state !== "pending" || existing.requester === uid)
    )
      throw fail(409, "No incoming request to decline.");
    if (
      op.action === "cancel" &&
      (existing.state !== "pending" || existing.requester !== uid)
    )
      throw fail(409, "No outgoing request to cancel.");
    await db.query(
      "DELETE FROM social_relationships WHERE low_id=$1 AND high_id=$2",
      [low, high],
    );
  }
  return socialState(db, uid);
}
export async function publish(db: pg.PoolClient, uid: string, input: unknown) {
  const op = z
    .object({ outingId: z.string().min(1).max(200) })
    .strict()
    .parse(input);
  await ensureOutings(db, uid);
  await ensureSocial(db, uid);
  const r = (
    await db.query("SELECT document FROM outings WHERE user_id=$1 AND id=$2", [
      uid,
      op.outingId,
    ])
  ).rows[0]?.document as Outing | undefined;
  if (!r || r.status !== "completed" || !r.inShelf)
    throw fail(422, "Finish and save this outing before sharing.");
  await db.query(
    "INSERT INTO social_posts(id,user_id,outing_id) VALUES($1,$2,$3) ON CONFLICT(user_id,outing_id) DO NOTHING",
    [randomUUID(), uid, op.outingId],
  );
  return socialState(db, uid);
}
export async function unpublish(db: pg.PoolClient, uid: string, id: unknown) {
  await db.query("DELETE FROM social_posts WHERE id=$1 AND user_id=$2", [
    publicId.parse(id),
    uid,
  ]);
  return socialState(db, uid);
}
/** Only previewed story content leaves the owner record. No origin, GPS, prefs, arrival, task flags or provider facts. */
function sharedStory(p: any) {
  const s = p.document.story,
    plan = rewardPlan(s as RuleStory);
  const notes: any[] = [],
    photos: any[] = [];
  for (let i = 0; i < plan.length; i++)
    for (const t of plan[i].tasks) {
      const key = `${i}:${t.id}`,
        note = s.taskNotes?.[key],
        photo = s.taskPhotos?.[key];
      if (typeof note === "string" && note.trim())
        notes.push({
          chapter: i,
          place: s.chapters[i].place,
          task: t.text,
          note,
        });
      if (
        typeof photo === "string" &&
        /^quavi-media:[0-9a-f-]{36}$/.test(photo)
      )
        photos.push({
          chapter: i,
          place: s.chapters[i].place,
          task: t.text,
          img: `quavi-shared:${p.id}:${photo.slice(12)}`,
        });
    }
  return {
    id: p.id,
    title: s.title,
    openingId: s.openingId,
    premise: s.premise,
    chapters: s.chapters.map((c: any) => ({
      title: c.title,
      place: c.place,
      kind: c.kind,
      meta: c.meta,
      mins: c.mins,
      desc: c.desc,
      walk: c.walk,
      persona: c.persona,
      color: c.color,
      at: c.at,
      alts: [],
    })),
    moments: {},
    tone: s.tone,
    captions: s.captions,
    date: s.date,
    intro: s.intro,
    sharedNotes: notes,
    sharedPhotos: photos,
    author: p.name,
    status: "done",
    shared: true,
  };
}
export async function readPost(db: pg.PoolClient, uid: string, id: unknown) {
  const p = (
    await db.query(postsSql + " AND p.id=$2", [uid, publicId.parse(id)])
  ).rows[0];
  if (!p) throw fail(404, "This story is no longer available to your circle.");
  return { story: sharedStory(p), owner: person(p), mine: p.user_id === uid };
}
export async function sharedMedia(
  db: pg.PoolClient,
  uid: string,
  id: unknown,
  mediaId: unknown,
) {
  const mid = publicId.parse(mediaId);
  const post = await readPost(db, uid, id);
  if (
    !JSON.stringify(post.story).includes(
      `quavi-shared:${publicId.parse(id)}:${mid}`,
    )
  )
    throw fail(404, "Photo unavailable");
  const p = (
    await db.query(
      "SELECT m.object_key FROM media_objects m JOIN social_posts p ON m.user_id=p.user_id WHERE p.id=$1 AND m.id=$2 AND m.uploaded_at IS NOT NULL",
      [id, mid],
    )
  ).rows[0];
  if (!p) throw fail(404, "Photo unavailable");
  return p.object_key as string;
}
export async function report(db: pg.PoolClient, uid: string, input: unknown) {
  const op = z
    .object({
      targetId: publicId,
      postId: publicId.optional(),
      reason: z.enum(["spam", "harassment", "unsafe", "other"]),
      details: z.string().trim().max(1000).default(""),
    })
    .strict()
    .parse(input);
  await ensureSocial(db, uid);
  const p = await target(db, uid, op.targetId);
  if (op.postId) {
    const post = await readPost(db, uid, op.postId);
    if (post.owner.id !== p.public_id) throw fail(404, "Story unavailable");
  }
  await db.query(
    "INSERT INTO social_reports(id,reporter,target_id,post_id,reason,details) VALUES($1,$2,$3,$4,$5,$6)",
    [randomUUID(), uid, p.user_id, op.postId ?? null, op.reason, op.details],
  );
  return { received: true };
}

export async function cleanupSocialReports(db: pg.Pool | pg.PoolClient) {
  await db.query(
    "DELETE FROM social_reports WHERE created_at<now()-interval '90 days'",
  );
}
