import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { z, ZodError } from "zod";
import type { Auth } from "firebase-admin/auth";
import type pg from "pg";
import { readState, writeState } from "./db.js";
import { MAX_PHOTO_BYTES, type MediaSigner } from "./media.js";
import { ownerHash, lockAccount, quota } from "./account.js";
import { detourInput, planDetours, type VenueProvider } from "./detours.js";
import { checkedDetours } from "./checked-detours.js";
import { walkingInput, type WalkingProvider } from "./walking.js";
import { appStateSchema, inspectState } from "./state-schema.js";

declare module "fastify" {
  interface FastifyRequest {
    uid: string;
    authTime: number;
    db: pg.PoolClient | null;
  }
}
const stateInput = z
  .object({
    state: appStateSchema,
    revision: z.number().int().nonnegative().max(2147483646),
  })
  .strict();
const uploadInput = z
  .object({
    contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    bytes: z.number().int().positive().max(MAX_PHOTO_BYTES),
  })
  .strict();

export async function createApp(options: {
  pool: pg.Pool;
  auth: Auth;
  origins: string[];
  media?: MediaSigner;
  logger?: boolean;
  now?: () => number;
  detours?: VenueProvider;
  walking?: WalkingProvider;
}) {
  const app = Fastify({
    bodyLimit: 2 * 1024 * 1024,
    logger: options.logger
      ? {
          redact: [
            "req.headers.authorization",
            "req.headers.cookie",
            "req.body",
          ],
        }
      : false,
  });
  app.decorateRequest("uid", "");
  app.decorateRequest("authTime", 0);
  app.decorateRequest("db", null);
  await app.register(cors, {
    origin: options.origins,
    methods: ["GET", "PUT", "POST", "DELETE"],
    allowedHeaders: ["Authorization", "Content-Type"],
  });
  app.addHook("onSend", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    reply.header("X-Content-Type-Options", "nosniff");
  });
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof ZodError)
      return reply.code(400).send({
        error: "Invalid request",
        fields: error.issues.map((i) => i.path.join(".")),
      });
    const code =
      error && typeof error === "object" && "statusCode" in error
        ? error.statusCode
        : undefined;
    const status =
      typeof code === "number" && code >= 400 && code <= 503 ? code : 500;
    if (status === 500) req.log.error({ err: error }, "Request failed");
    return reply.code(status).send({
      error:
        status >= 500
          ? "Service temporarily unavailable. Try again shortly."
          : status === 429
            ? "Too many lookups. Try again later."
            : "Invalid request",
    });
  });
  app.get("/healthz", async () => ({ status: "ok" }));
  app.get("/readyz", async (_req, reply) => {
    try {
      await options.pool.query("SELECT 1");
      return { status: "ready" };
    } catch {
      return reply.code(503).send({ status: "unavailable" });
    }
  });
  await app.register(
    async (api) => {
      api.addHook("preHandler", async (req, reply) => {
        const header = req.headers.authorization;
        if (!header?.startsWith("Bearer "))
          return reply.code(401).send({ error: "Sign in required" });
        const deleting =
          req.method === "DELETE" && req.routeOptions.url === "/v1/me";
        try {
          const token = await options.auth.verifyIdToken(
            header.slice(7),
            false,
          );
          req.uid = token.uid;
          req.authTime = token.auth_time;
        } catch {
          return reply
            .code(401)
            .send({ error: "Session expired or invalid. Sign in again." });
        }
        req.db = await options.pool.connect();
        await req.db.query("BEGIN");
        await lockAccount(req.db, req.uid);
        const pending = await req.db.query(
          "SELECT owner_hash FROM account_deletions WHERE owner_hash=$1",
          [ownerHash(req.uid)],
        );
        if (pending.rowCount && !deleting)
          return reply
            .code(410)
            .send({ error: "This account is being deleted." });
        if (!deleting) {
          try {
            await options.auth.verifyIdToken(header.slice(7), true);
          } catch {
            return reply
              .code(401)
              .send({ error: "Session expired or invalid. Sign in again." });
          }
        }
        if (!(await quota(req.db, ownerHash(req.uid), "api", 120)))
          return reply
            .code(429)
            .send({ error: "Too many requests. Try again in a minute." });
      });
      api.addHook("onSend", async (req, reply, payload) => {
        const db = req.db;
        req.db = null;
        if (db) {
          try {
            await db.query(reply.statusCode >= 500 ? "ROLLBACK" : "COMMIT");
          } finally {
            db.release();
          }
        }
        return payload;
      });
      api.addHook("onResponse", async (req) => {
        if (req.db) {
          const db = req.db;
          req.db = null;
          try {
            await db.query("ROLLBACK");
          } finally {
            db.release();
          }
        }
      });
      api.delete("/me", async (req, reply) => {
        z.object({ confirm: z.literal("DELETE") })
          .strict()
          .parse(req.body);
        const db = req.db!,
          hash = ownerHash(req.uid);
        const existing = await db.query(
          "SELECT owner_hash FROM account_deletions WHERE owner_hash=$1",
          [hash],
        );
        if (!existing.rowCount) {
          try {
            await options.auth.verifyIdToken(
              req.headers.authorization!.slice(7),
              true,
            );
          } catch {
            return reply
              .code(401)
              .send({ error: "Sign in again before deleting your account." });
          }
          if ((options.now?.() ?? Date.now()) / 1000 - req.authTime > 300)
            return reply.code(401).send({
              error:
                "Confirm your password again before deleting your account.",
              code: "reauth_required",
            });
          await db.query(
            "INSERT INTO account_deletions(owner_hash,user_id) VALUES($1,$2)",
            [hash, req.uid],
          );
          await db.query("DELETE FROM user_state WHERE user_id=$1", [req.uid]);
        }
        return reply.code(202).send({
          status: "deleting",
          message:
            "Account access is blocked. Cleanup will finish after upload links expire.",
        });
      });
      api.get("/me", async (req) => ({ userId: req.uid }));
      api.post("/me/detours", async (req, reply) => {
        const input = detourInput.parse(req.body);
        if (!options.detours)
          return reply.code(503).send({
            error:
              "City-aware detours are not available. Try again later or use the separate demo.",
          });
        if (!(await quota(req.db!, ownerHash(req.uid), "detours", 12, 86400)))
          return reply
            .code(429)
            .send({ error: "Daily detour limit reached. Try again tomorrow." });
        const db = req.db!;
        req.db = null;
        try {
          await db.query("COMMIT");
        } finally {
          db.release();
        }
        const nearby = await options.detours.nearby(input.origin);
        const planned = options.walking
          ? await checkedDetours(nearby, input, options.walking)
          : planDetours(nearby, input);
        req.db = await options.pool.connect();
        await req.db.query("BEGIN");
        await lockAccount(req.db, req.uid);
        if (
          (
            await req.db.query(
              "SELECT 1 FROM account_deletions WHERE owner_hash=$1",
              [ownerHash(req.uid)],
            )
          ).rowCount
        )
          return reply
            .code(410)
            .send({ error: "This account is being deleted." });
        return planned;
      });
      api.post("/me/walking-check", async (req, reply) => {
        const { points } = walkingInput.parse(req.body);
        if (!options.walking)
          return reply
            .code(503)
            .send({
              error: "Walking checks are unavailable. Try again shortly.",
            });
        if (
          !(await quota(req.db!, ownerHash(req.uid), "walking-check", 60, 3600))
        )
          return reply
            .code(429)
            .send({ error: "Too many walking checks. Try again later." });
        const db = req.db!;
        req.db = null;
        try {
          await db.query("COMMIT");
        } finally {
          db.release();
        }
        const route = await options.walking.check(points);
        req.db = await options.pool.connect();
        await req.db.query("BEGIN");
        await lockAccount(req.db, req.uid);
        if (
          (
            await req.db.query(
              "SELECT 1 FROM account_deletions WHERE owner_hash=$1",
              [ownerHash(req.uid)],
            )
          ).rowCount
        )
          return reply
            .code(410)
            .send({ error: "This account is being deleted." });
        if (!route)
          return reply
            .code(422)
            .send({
              error:
                "No suitable walking route connects these stops. Choose another detour.",
            });
        return route;
      });
      api.get(
        "/me/state",
        async (req) =>
          (await readState(req.db!, req.uid)) ?? {
            state: null,
            revision: 0,
            updatedAt: null,
          },
      );
      api.put("/me/state", async (req, reply) => {
        const { state, revision } = stateInput.parse(req.body),
          refs = inspectState(state);
        if (refs.length) {
          const owned = await req.db!.query(
            "SELECT id FROM media_objects WHERE user_id=$1 AND uploaded_at IS NOT NULL AND id=ANY($2::uuid[])",
            [req.uid, refs],
          );
          if (owned.rowCount !== refs.length)
            return reply.code(400).send({
              error: "Finish uploading your own photos before saving.",
            });
        }
        const saved = await writeState(req.db!, req.uid, state, revision);
        if (!saved)
          return reply.code(409).send({
            error:
              "Changes were saved on another device. Reload before retrying.",
          });
        return saved;
      });
      api.post("/me/media", async (req, reply) => {
        if (!options.media)
          return reply
            .code(503)
            .send({ error: "Photo storage is not configured" });
        const input = uploadInput.parse(req.body);
        if (!(await quota(req.db!, ownerHash(req.uid), "photo", 40, 3600)))
          return reply
            .code(429)
            .send({ error: "Photo limit reached. Try again in an hour." });
        const usage = await req.db!.query(
          "SELECT coalesce(sum(bytes),0)::bigint AS bytes,count(*)::integer AS count FROM media_objects WHERE user_id=$1",
          [req.uid],
        );
        if (
          Number(usage.rows[0].bytes) + input.bytes > 256 * 1024 * 1024 ||
          usage.rows[0].count >= 1000
        )
          return reply
            .code(413)
            .send({ error: "Your account photo storage is full." });
        const id = randomUUID(),
          key = `pending/${ownerHash(req.uid)}/${id}`;
        const upload = await options.media.upload(
          key,
          input.contentType,
          input.bytes,
        );
        await req.db!.query(
          "INSERT INTO media_objects(id,user_id,object_key,content_type,bytes) VALUES($1,$2,$3,$4,$5)",
          [id, req.uid, key, input.contentType, input.bytes],
        );
        return reply.code(201).send({ id, upload, expiresInSeconds: 600 });
      });
      api.post("/me/media/:id/complete", async (req, reply) => {
        const id = z.uuid().parse((req.params as { id: string }).id);
        const {
          rows: [photo],
        } = await req.db!.query(
          "SELECT * FROM media_objects WHERE id=$1 AND user_id=$2",
          [id, req.uid],
        );
        if (!photo) return reply.code(404).send({ error: "Photo not found" });
        if (!options.media)
          return reply
            .code(503)
            .send({ error: "Photo storage is not configured" });
        const done = await options.media.finalize(
          photo.object_key,
          photo.content_type,
          photo.bytes,
        );
        await req.db!.query(
          "UPDATE media_objects SET bytes=$2,object_key=$3,uploaded_at=now() WHERE id=$1",
          [id, done.bytes, done.key],
        );
        return { id, status: "uploaded" };
      });
      api.get("/me/media/:id", async (req, reply) => {
        const id = z.uuid().parse((req.params as { id: string }).id);
        const {
          rows: [photo],
        } = await req.db!.query(
          "SELECT * FROM media_objects WHERE id=$1 AND user_id=$2",
          [id, req.uid],
        );
        if (!photo) return reply.code(404).send({ error: "Photo not found" });
        if (!options.media)
          return reply
            .code(503)
            .send({ error: "Photo storage is not configured" });
        if (!photo.uploaded_at) {
          const done = await options.media.finalize(
            photo.object_key,
            photo.content_type,
            photo.bytes,
          );
          await req.db!.query(
            "UPDATE media_objects SET bytes=$2,object_key=$3,uploaded_at=now() WHERE id=$1",
            [id, done.bytes, done.key],
          );
          photo.object_key = done.key;
        }
        return {
          url: await options.media.read(photo.object_key),
          expiresInSeconds: 300,
        };
      });
    },
    { prefix: "/v1" },
  );
  return app;
}
