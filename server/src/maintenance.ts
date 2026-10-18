import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { readConfig } from "./config.js";
import { createPool } from "./db.js";
import { cloudStorageSigner } from "./media.js";
import { processDeletions, lockAccount } from "./account.js";
const config = readConfig();
if (!config.MEDIA_BUCKET) throw new Error("MEDIA_BUCKET is required");
const firebase = initializeApp({
  projectId: config.GOOGLE_CLOUD_PROJECT,
  ...(config.FIREBASE_AUTH_EMULATOR_HOST
    ? {}
    : { credential: applicationDefault() }),
});
const pool = createPool(config.DATABASE_URL),
  media = cloudStorageSigner(config.GOOGLE_CLOUD_PROJECT, config.MEDIA_BUCKET);
try {
  await processDeletions(pool, getAuth(firebase), media);
  const orphans = await pool.query(
    `SELECT m.id,m.user_id,m.object_key FROM media_objects m LEFT JOIN user_state s ON s.user_id=m.user_id WHERE m.created_at<now()-interval '24 hours' AND(s.document IS NULL OR position('quavi-media:'||m.id::text in s.document::text)=0) LIMIT 100`,
  );
  for (const photo of orphans.rows) {
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      await lockAccount(db, photo.user_id);
      const referenced = await db.query(
        "SELECT 1 FROM user_state WHERE user_id=$1 AND position('quavi-media:'||$2 in document::text)>0",
        [photo.user_id, photo.id],
      );
      if (!referenced.rowCount) {
        await media.remove(photo.object_key);
        await db.query("DELETE FROM media_objects WHERE id=$1", [photo.id]);
      }
      await db.query("COMMIT");
    } catch {
      await db.query("ROLLBACK");
      console.error("Orphan photo cleanup will retry");
    } finally {
      db.release();
    }
  }
  const completed = await pool.query(
    "SELECT owner_hash FROM account_deletions WHERE completed_at IS NOT NULL AND coalesce(last_sweep_at,completed_at)<now()-interval '1 hour' ORDER BY coalesce(last_sweep_at,completed_at) LIMIT 100",
  );
  for (const job of completed.rows) {
    await media.removeOwner(job.owner_hash);
    await pool.query(
      "UPDATE account_deletions SET last_sweep_at=now() WHERE owner_hash=$1",
      [job.owner_hash],
    );
  }
  await media.cleanupStaging();
  await pool.query(
    "DELETE FROM request_quotas WHERE window_at<now()-interval '2 days'",
  );
  await pool.query(
    "DELETE FROM account_deletions WHERE completed_at<now()-interval '30 days'",
  );
  const delayed = await pool.query(
    "SELECT count(*)::integer AS count FROM account_deletions WHERE completed_at IS NULL AND requested_at<now()-interval '1 hour'",
  );
  if (delayed.rows[0].count)
    throw new Error("Account cleanup overdue; inspect maintenance logs");
  console.log("Maintenance completed");
} finally {
  await pool.end();
}
