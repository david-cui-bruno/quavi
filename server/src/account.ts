import { createHash } from "node:crypto";
import type pg from "pg";
import type { Auth } from "firebase-admin/auth";
import type { MediaSigner } from "./media.js";
export const ownerHash = (uid: string) =>
  createHash("sha256").update(uid).digest("hex");
export async function lockAccount(db: pg.PoolClient, uid: string) {
  await db.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 72418202))",
    [uid],
  );
}
export async function quota(
  db: pg.PoolClient,
  owner: string,
  category: string,
  limit: number,
  seconds = 60,
) {
  const { rows } = await db.query(
    `INSERT INTO request_quotas(owner_hash,category,window_at,used)
    VALUES($1,$2,to_timestamp(floor(extract(epoch FROM now())/$3)*$3),1)
    ON CONFLICT(owner_hash,category,window_at) DO UPDATE SET used=request_quotas.used+1 RETURNING used`,
    [owner, category, seconds],
  );
  return rows[0].used <= limit;
}
const missingUser = (e: unknown) =>
  (e as { code?: string }).code === "auth/user-not-found";
/** Idempotent durable work. A second purge after signed-upload expiry closes the late-upload race. */
export async function processDeletions(
  pool: pg.Pool,
  auth: Auth,
  media: MediaSigner,
  now = new Date(),
) {
  const work = await pool.query(
    "SELECT user_id FROM account_deletions WHERE completed_at IS NULL AND retry_at <= $1 ORDER BY requested_at LIMIT 25",
    [now],
  );
  for (const item of work.rows) {
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      await lockAccount(db, item.user_id);
      const {
        rows: [job],
      } = await db.query(
        "SELECT * FROM account_deletions WHERE owner_hash=$1 AND completed_at IS NULL FOR UPDATE",
        [ownerHash(item.user_id)],
      );
      if (!job) {
        await db.query("COMMIT");
        continue;
      }
      if (!job.scrubbed_at) {
        try {
          await auth.updateUser(item.user_id, { disabled: true });
          await auth.revokeRefreshTokens(item.user_id);
        } catch (e) {
          if (!missingUser(e)) throw e;
        }
        await media.removeOwner(ownerHash(item.user_id));
        await db.query(
          "UPDATE account_deletions SET scrubbed_at=$2,retry_at=finalize_after WHERE owner_hash=$1",
          [ownerHash(item.user_id), now],
        );
      }
      if (new Date(job.finalize_after) <= now) {
        await media.removeOwner(ownerHash(item.user_id));
        try {
          await auth.deleteUser(item.user_id);
        } catch (e) {
          if (!missingUser(e)) throw e;
        }
        await db.query("DELETE FROM reward_accounts WHERE user_id=$1", [item.user_id]);
        await db.query("DELETE FROM outings WHERE user_id=$1", [item.user_id]);
        await db.query("DELETE FROM outing_accounts WHERE user_id=$1", [item.user_id]);
        await db.query("DELETE FROM user_state WHERE user_id=$1", [
          item.user_id,
        ]);
        await db.query("DELETE FROM media_objects WHERE user_id=$1", [
          item.user_id,
        ]);
        await db.query("DELETE FROM request_quotas WHERE owner_hash=$1", [
          ownerHash(item.user_id),
        ]);
        await db.query(
          "UPDATE account_deletions SET completed_at=$2,user_id=NULL WHERE owner_hash=$1",
          [ownerHash(item.user_id), now],
        );
      }
      await db.query("COMMIT");
    } catch {
      await db.query("ROLLBACK");
      await pool.query(
        `UPDATE account_deletions SET attempts=attempts+1,retry_at=now()+least(interval '1 hour',interval '1 minute'*power(2,least(attempts,6))) WHERE owner_hash=$1 AND completed_at IS NULL`,
        [ownerHash(item.user_id)],
      );
      console.error("Account cleanup will retry");
    } finally {
      db.release();
    }
  }
}

/** Provider caps span a calendar month; ordinary account counters only need two days. */
export async function cleanupQuotas(pool:pg.Pool){
 await pool.query("DELETE FROM request_quotas WHERE (category NOT IN ('google-places','google-routes') AND window_at<now()-interval '2 days') OR (category IN ('google-places','google-routes') AND window_at<date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')");
}
