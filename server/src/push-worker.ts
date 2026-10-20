import { createPool } from "./db.js";
import { apnsSender, dispatchPush } from "./push.js";
const send = apnsSender();
if (!send) throw new Error("APNs credentials are not configured.");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const pool = createPool(process.env.DATABASE_URL);
try {
  console.log(await dispatchPush(pool, send));
} finally {
  await pool.end();
}
