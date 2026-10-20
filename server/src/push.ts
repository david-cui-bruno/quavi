import { connect } from "node:http2";
import { sign } from "node:crypto";
import type pg from "pg";
import { notificationVisible } from "./social-delivery.js";
type Sender = (
  token: string,
  environment: string,
  id: string,
) => Promise<"sent" | "invalid" | "retry">;
export function apnsSender(
  env: NodeJS.ProcessEnv = process.env,
): Sender | undefined {
  if (!env.APNS_KEY_ID || !env.APNS_TEAM_ID || !env.APNS_PRIVATE_KEY) return;
  const part = (v: unknown) =>
    Buffer.from(JSON.stringify(v)).toString("base64url");
  let jwt = "",
    issued = 0;
  return async (token, environment, id) => {
    if (Date.now() - issued > 3000000) {
      const body =
        part({ alg: "ES256", kid: env.APNS_KEY_ID }) +
        "." +
        part({ iss: env.APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) });
      jwt =
        body +
        "." +
        sign("sha256", Buffer.from(body), {
          key: env.APNS_PRIVATE_KEY!,
          dsaEncoding: "ieee-p1363",
        }).toString("base64url");
      issued = Date.now();
    }
    return new Promise((resolve) => {
      const session = connect(
        environment === "sandbox"
          ? "https://api.sandbox.push.apple.com"
          : "https://api.push.apple.com",
      );
      let finished = false;
      const done = (result: "sent" | "invalid" | "retry") => {
        if (finished) return;
        finished = true;
        session.destroy();
        resolve(result);
      };
      session.on("error", () => done("retry"));
      session.setTimeout(10000, () => done("retry"));
      const request = session.request({
        ":method": "POST",
        ":path": "/3/device/" + token,
        authorization: "bearer " + jwt,
        "apns-topic": "com.quavi.app",
        "apns-push-type": "alert",
        "apns-priority": "10",
        "apns-id": id,
        "apns-collapse-id": id,
        "apns-expiration": String(Math.floor(Date.now() / 1000) + 3600),
      });
      let status = 0,
        body = "";
      request.on("response", (h) => {
        status = Number(h[":status"]);
      });
      request.setEncoding("utf8");
      request.on("data", (chunk) => {
        if (body.length < 2048) body += chunk;
      });
      request.on("error", () => done("retry"));
      request.on("end", () => {
        let reason = "";
        try {
          reason = JSON.parse(body).reason;
        } catch {}
        done(
          status === 200
            ? "sent"
            : status === 410 ||
                ["BadDeviceToken", "Unregistered"].includes(reason)
              ? "invalid"
              : "retry",
        );
      });
      // No names, story text, locations or report reasons appear on a locked screen.
      request.end(
        JSON.stringify({
          aps: {
            alert: {
              title: "Quavi",
              body: "You have a new update in your circle.",
            },
            sound: "default",
          },
          notificationId: id,
        }),
      );
    });
  };
}
export async function dispatchPush(pool: pg.Pool, send: Sender, max = 20) {
  let sent = 0;
  for (let i = 0; i < max; i++) {
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      await db.query(
        `INSERT INTO push_deliveries(notification_id,token) SELECT n.id,d.token FROM social_notifications n JOIN push_devices d ON d.user_id=n.recipient WHERE n.read_at IS NULL AND n.created_at>=d.updated_at AND n.created_at>now()-interval '1 hour' AND ${notificationVisible} ON CONFLICT DO NOTHING`,
      );
      const r = (
        await db.query(
          `SELECT n.id,d.token,d.environment FROM push_deliveries q JOIN social_notifications n ON n.id=q.notification_id JOIN push_devices d ON d.token=q.token AND d.user_id=n.recipient WHERE q.sent_at IS NULL AND q.attempts<5 AND q.retry_at<=now() AND n.read_at IS NULL AND n.created_at>now()-interval '1 hour' AND ${notificationVisible} ORDER BY q.retry_at LIMIT 1 FOR UPDATE OF q,d SKIP LOCKED`,
        )
      ).rows[0];
      if (!r) {
        await db.query("COMMIT");
        break;
      }
      const result = await send(r.token, r.environment, r.id);
      if (result === "invalid")
        await db.query("DELETE FROM push_devices WHERE token=$1", [r.token]);
      else
        await db.query(
          `UPDATE push_deliveries SET attempts=attempts+1,sent_at=CASE WHEN $3 THEN now() ELSE NULL END,retry_at=now()+interval '2 minutes' WHERE notification_id=$1 AND token=$2`,
          [r.id, r.token, result === "sent"],
        );
      await db.query("COMMIT");
      if (result === "sent") sent++;
    } catch {
      await db.query("ROLLBACK");
      throw new Error("Push dispatch failed; pending delivery will retry.");
    } finally {
      db.release();
    }
  }
  return { sent };
}
