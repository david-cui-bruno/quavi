import type pg from "pg";
import { quota } from "./account.js";
/** Cross-instance admission for the development foot service's one-request/second policy.
 * Only the provider clock is persisted; exact requested routes are never cached here. */
export function walkingAdmission(pool: pg.Pool) {
  return async () => {
    const db = await pool.connect();
    let delay = 0;
    try {
      await db.query("BEGIN");
      await db.query("SELECT pg_advisory_xact_lock(72418204)");
      if (!(await quota(db, "project", "walking-provider", 400, 86400)))
        throw Object.assign(
          new Error("Daily walking lookup limit reached. Try again tomorrow."),
          { statusCode: 429 },
        );
      const {
        rows: [r],
      } = await db.query(
        `SELECT greatest(0,extract(epoch FROM (source_updated_at+interval '1.1 seconds'-clock_timestamp()))*1000)::double precision AS delay FROM venue_cache WHERE area_key='provider-clock:foot'`,
      );
      delay = Number(r?.delay ?? 0);
      if (delay > 3500)
        throw Object.assign(
          new Error("Walking checks are busy. Try again shortly."),
          { statusCode: 429 },
        );
      await db.query(
        `INSERT INTO venue_cache(area_key,document,source_updated_at) VALUES('provider-clock:foot','{}',clock_timestamp()+$1*interval '1 millisecond') ON CONFLICT(area_key) DO UPDATE SET source_updated_at=clock_timestamp()+$1*interval '1 millisecond',expires_at=now()+interval '1 day'`,
        [delay],
      );
      await db.query("COMMIT");
    } catch (e) {
      await db.query("COMMIT");
      throw e;
    } finally {
      db.release();
    }
    if (delay > 0)
      await new Promise((resolve) => setTimeout(resolve, Math.ceil(delay)));
  };
}
