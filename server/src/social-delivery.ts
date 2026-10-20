import type pg from "pg";
import { z } from "zod";
import { SocialError, ensureSocial, sharedStory } from "./social.js";
const cursorSchema = z
  .object({
    at: z
      .string()
      .min(1)
      .max(80)
      .refine((v) => Number.isFinite(Date.parse(v))),
    id: z.uuid(),
  })
  .strict();
export function readCursor(value: unknown) {
  if (value === undefined) return null;
  try {
    return cursorSchema.parse(
      JSON.parse(
        Buffer.from(z.string().max(300).parse(value), "base64url").toString(),
      ),
    );
  } catch {
    throw new SocialError(400, "Invalid page. Refresh and try again.");
  }
}
export const nextCursor = (r: any) =>
  Buffer.from(JSON.stringify({ at: r.cursor_time, id: r.id })).toString(
    "base64url",
  );
export const allowedPair = `EXISTS(SELECT 1 FROM social_relationships r WHERE r.low_id=least(n.actor COLLATE "C",n.recipient) AND r.high_id=greatest(n.actor COLLATE "C",n.recipient) AND r.state='accepted') AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.user_id=n.actor AND b.target_id=n.recipient) OR (b.user_id=n.recipient AND b.target_id=n.actor))`;
export const notificationVisible = `(
 (n.kind='friend_request' AND EXISTS(SELECT 1 FROM social_relationships r WHERE r.request_id::text=n.event_key AND r.state='pending' AND r.requester=n.actor) AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.user_id=n.actor AND b.target_id=n.recipient) OR (b.user_id=n.recipient AND b.target_id=n.actor)))
 OR (n.kind='friend_accepted' AND ${allowedPair} AND EXISTS(SELECT 1 FROM social_relationships r WHERE r.request_id::text=n.event_key))
 OR (n.kind='story_shared' AND ${allowedPair} AND EXISTS(SELECT 1 FROM social_posts p JOIN outings o ON o.user_id=p.user_id AND o.id=p.outing_id WHERE p.id=n.post_id AND p.hidden_at IS NULL AND o.document->>'status'='completed' AND o.document->>'inShelf'='true' AND NOT EXISTS(SELECT 1 FROM social_restrictions s WHERE s.user_id=p.user_id AND s.until_at>now())))
 OR (n.kind='report_update' AND EXISTS(SELECT 1 FROM social_reports r WHERE r.id=n.report_id AND r.reporter=n.recipient))
) AND NOT EXISTS(SELECT 1 FROM account_deletions d WHERE d.user_id IN(n.actor,n.recipient))`;
export async function notify(
  db: pg.PoolClient,
  recipient: string,
  actor: string,
  kind: string,
  event: string,
  post?: string,
  report?: string,
) {
  await db.query(
    `INSERT INTO social_notifications(recipient,actor,kind,event_key,post_id,report_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
    [recipient, actor, kind, event, post ?? null, report ?? null],
  );
}
export async function unreadNotifications(db: pg.PoolClient, uid: string) {
  return (
    await db.query(
      `SELECT count(*)::int AS n FROM social_notifications n WHERE n.recipient=$1 AND n.read_at IS NULL AND ${notificationVisible}`,
      [uid],
    )
  ).rows[0].n as number;
}
export async function inbox(db: pg.PoolClient, uid: string, cursor?: unknown) {
  await ensureSocial(db, uid);
  const c = readCursor(cursor);
  const rows = (
    await db.query(
      `SELECT n.*,n.created_at::text AS cursor_time,s.public_id,s.handle,s.name FROM social_notifications n JOIN social_profiles s ON s.user_id=n.actor WHERE n.recipient=$1 AND ${notificationVisible} ${c ? "AND (n.created_at,n.id)<($2::timestamptz,$3::uuid)" : ""} ORDER BY n.created_at DESC,n.id DESC LIMIT 31`,
      c ? [uid, c.at, c.id] : [uid],
    )
  ).rows;
  const count = (
    await db.query(
      `SELECT count(*)::int AS n FROM social_notifications n WHERE n.recipient=$1 AND n.read_at IS NULL AND ${notificationVisible}`,
      [uid],
    )
  ).rows[0].n;
  const page = rows.slice(0, 30);
  return {
    items: page.map((n) => ({
      id: n.id,
      kind: n.kind,
      actor:
        n.kind === "report_update"
          ? undefined
          : { id: n.public_id, handle: n.handle, name: n.name },
      postId: n.post_id ?? undefined,
      createdAt: n.created_at,
      read: !!n.read_at,
    })),
    unread: count,
    nextCursor: rows.length > 30 ? nextCursor(page.at(-1)) : null,
  };
}
export async function markRead(db: pg.PoolClient, uid: string, input: unknown) {
  const { ids } = z
    .object({ ids: z.array(z.uuid()).min(1).max(100) })
    .strict()
    .parse(input);
  await db.query(
    "UPDATE social_notifications SET read_at=coalesce(read_at,now()) WHERE recipient=$1 AND id=ANY($2::uuid[])",
    [uid, ids],
  );
  return { ok: true };
}
export async function assertSocialAllowed(db: pg.PoolClient, uid: string) {
  if (
    (
      await db.query(
        "SELECT 1 FROM social_restrictions WHERE user_id=$1 AND until_at>now()",
        [uid],
      )
    ).rowCount
  )
    throw new SocialError(
      403,
      "Sharing and friend requests are temporarily restricted. You can still use your private outings, remove friends, block or report.",
    );
}
export async function moderationQueue(db: pg.PoolClient, cursor?: unknown) {
  const c = readCursor(cursor);
  const rows = (
    await db.query(
      `SELECT r.*,r.created_at::text AS cursor_time,t.public_id AS target_public_id,t.handle AS target_handle,t.name AS target_name,s.handle AS reporter_handle FROM social_reports r JOIN social_profiles t ON t.user_id=r.target_id JOIN social_profiles s ON s.user_id=r.reporter WHERE r.status='open' ${c ? "AND (r.created_at,r.id)<($1::timestamptz,$2::uuid)" : ""} ORDER BY r.created_at DESC,r.id DESC LIMIT 31`,
      c ? [c.at, c.id] : [],
    )
  ).rows;
  const page = rows.slice(0, 30);
  return {
    items: page.map((r) => ({
      id: r.id,
      reason: r.reason,
      details: r.details,
      createdAt: r.created_at,
      target: {
        id: r.target_public_id,
        handle: r.target_handle,
        name: r.target_name,
      },
      reporterHandle: r.reporter_handle,
      postId: r.post_id,
    })),
    nextCursor: rows.length > 30 ? nextCursor(page.at(-1)) : null,
  };
}
export async function moderate(db: pg.PoolClient, uid: string, input: unknown) {
  const v = z
    .object({
      reportId: z.uuid(),
      action: z.enum(["dismiss", "hide_story", "restrict_user"]),
      note: z.string().trim().min(3).max(1000),
    })
    .strict()
    .parse(input);
  const r = (
    await db.query("SELECT * FROM social_reports WHERE id=$1 FOR UPDATE", [
      v.reportId,
    ])
  ).rows[0];
  if (!r) throw new SocialError(404, "Report unavailable.");
  if (r.status !== "open") return { resolved: true };
  if (r.target_id === uid || r.reporter === uid)
    throw new SocialError(
      403,
      "Another moderator must review reports involving your account.",
    );
  if (v.action === "hide_story") {
    if (!r.post_id)
      throw new SocialError(
        409,
        "This report has no available story. Choose another action.",
      );
    await db.query(
      "INSERT INTO social_hidden_outings(user_id,outing_id) SELECT user_id,outing_id FROM social_posts WHERE id=$1 ON CONFLICT DO NOTHING",
      [r.post_id],
    );
    await db.query("UPDATE social_posts SET hidden_at=now() WHERE id=$1", [
      r.post_id,
    ]);
  }
  if (v.action === "restrict_user")
    await db.query(
      `INSERT INTO social_restrictions(user_id,until_at,reason) VALUES($1,now()+interval '7 days',$2) ON CONFLICT(user_id) DO UPDATE SET until_at=EXCLUDED.until_at,reason=EXCLUDED.reason`,
      [r.target_id, v.note],
    );
  await db.query(
    "INSERT INTO moderation_actions(report_id,moderator,action,note) VALUES($1,$2,$3,$4)",
    [r.id, uid, v.action, v.note],
  );
  await db.query(
    "UPDATE social_reports SET status='resolved',resolution=$2,resolved_at=now() WHERE id=$1",
    [r.id, v.action],
  );
  await notify(
    db,
    r.reporter,
    r.reporter,
    "report_update",
    r.id,
    undefined,
    r.id,
  );
  return { resolved: true };
}
export async function registerDevice(
  db: pg.PoolClient,
  uid: string,
  input: unknown,
) {
  const v = z
    .object({
      token: z.string().regex(/^[0-9a-f]{64,256}$/i),
      environment: z.enum(["production", "sandbox"]),
    })
    .strict()
    .parse(input);
  await ensureSocial(db, uid);
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    "push:" + v.token,
  ]);
  // Rebinding a shared phone removes the previous account association and queued sends.
  await db.query("DELETE FROM push_deliveries WHERE token=$1", [v.token]);
  await db.query(
    `INSERT INTO push_devices(token,user_id,environment) VALUES($1,$2,$3) ON CONFLICT(token) DO UPDATE SET user_id=EXCLUDED.user_id,environment=EXCLUDED.environment,updated_at=now()`,
    [v.token, uid, v.environment],
  );
  await db.query(
    `DELETE FROM push_devices WHERE user_id=$1 AND token IN(SELECT token FROM push_devices WHERE user_id=$1 ORDER BY updated_at DESC OFFSET 5)`,
    [uid],
  );
  return { registered: true };
}
export async function removeDevice(
  db: pg.PoolClient,
  uid: string,
  input: unknown,
) {
  const { token } = z
    .object({ token: z.string().min(64).max(256) })
    .strict()
    .parse(input);
  await db.query("DELETE FROM push_devices WHERE user_id=$1 AND token=$2", [
    uid,
    token,
  ]);
  return { removed: true };
}

export async function moderationEvidence(db: pg.PoolClient, id: unknown) {
  const row = (
    await db.query(
      `SELECT p.*,s.name,o.document FROM social_reports r JOIN social_posts p ON p.id=r.post_id JOIN social_profiles s ON s.user_id=p.user_id JOIN outings o ON o.user_id=p.user_id AND o.id=p.outing_id WHERE r.id=$1`,
      [z.uuid().parse(id)],
    )
  ).rows[0];
  if (!row)
    throw new SocialError(404, "Reported story is no longer available.");
  const story = sharedStory(row);
  story.sharedPhotos = story.sharedPhotos.map((p: any) => ({
    ...p,
    img: p.img.replace(
      "quavi-shared:" + row.id + ":",
      "quavi-moderation:" + id + ":",
    ),
  }));
  return { story };
}

export async function moderationMedia(
  db: pg.PoolClient,
  id: unknown,
  media: unknown,
) {
  const mid = z.uuid().parse(media);
  const { story } = await moderationEvidence(db, id);
  if (
    !story.sharedPhotos.some(
      (p: any) => p.img === `quavi-moderation:${id}:${mid}`,
    )
  )
    throw new SocialError(404, "Photo unavailable");
  const row = (
    await db.query(
      `SELECT m.object_key FROM social_reports r JOIN social_posts p ON p.id=r.post_id JOIN media_objects m ON m.user_id=p.user_id WHERE r.id=$1 AND m.id=$2 AND m.uploaded_at IS NOT NULL`,
      [id, mid],
    )
  ).rows[0];
  if (!row) throw new SocialError(404, "Photo unavailable");
  return row.object_key as string;
}
