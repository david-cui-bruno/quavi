import * as delivery from './social-delivery.js';
import * as social from './social.js';
import {ensureRewards,rewardsActive,rewardState,redeem} from "./rewards.js";
import { ensureOutings, listOutings, applyOutingOperation } from "./outings.js";
import { legalPage } from "./legal.js";
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
import { liveCheckInput, checkHours } from "./live-detours.js";
import type { LiveGeo } from "./google-geo.js";
import { scrubGoogleContent } from "./google-retention.js";
import { appStateSchema, inspectState } from "./state-schema.js";

declare module "fastify" {
  interface FastifyRequest {
    uid: string;
    moderator: boolean;
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
  liveGeo?: LiveGeo;
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
  app.decorateRequest("moderator",false);
  app.decorateRequest("authTime", 0);
  app.decorateRequest("db", null);
  await app.register(cors, {
    origin: options.origins,
    methods: ["GET", "PUT", "POST", "DELETE"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Quavi-Maps", "X-Quavi-Outings", "X-Quavi-Rewards"],
  });
  app.addHook("onSend", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    reply.header("X-Content-Type-Options", "nosniff");
  });
  app.setErrorHandler((error, req, reply) => {
    if(error instanceof social.SocialError)return reply.code(error.statusCode).send({error:error.message});
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
  for (const kind of ["privacy", "terms"] as const)
    app.get("/legal/" + kind, async (_req, reply) =>
      reply.type("text/html").send(legalPage(kind)),
    );
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
          req.moderator=token.quaviModerator===true;
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
          await db.query("DELETE FROM social_profiles WHERE user_id=$1", [req.uid]);
          await db.query("DELETE FROM reward_accounts WHERE user_id=$1", [req.uid]);
          await db.query("DELETE FROM outings WHERE user_id=$1", [req.uid]);
          await db.query("DELETE FROM outing_accounts WHERE user_id=$1", [req.uid]);
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
        const live =
          req.headers["x-quavi-maps"] === "google"
            ? options.liveGeo
            : undefined;
        const walking = live ?? options.walking;
        const planned = walking
          ? await checkedDetours(nearby, input, walking, live)
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
          return reply.code(503).send({
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
          return reply.code(422).send({
            error:
              "No suitable walking route connects these stops. Choose another detour.",
          });
        return route;
      });
      for (const kind of ["walking-route", "detour-check"] as const)
        api.post("/me/" + kind, async (req, reply) => {
          if (!options.liveGeo)
            return reply
              .code(503)
              .send({
                error: "Google Maps checks are unavailable. Try again shortly.",
              });
          const input =
            kind === "walking-route"
              ? { ...walkingInput.parse(req.body), stops: undefined }
              : liveCheckInput.parse(req.body);
          if (
            !(await quota(
              req.db!,
              ownerHash(req.uid),
              "google-check",
              60,
              3600,
            ))
          )
            return reply
              .code(429)
              .send({ error: "Too many map checks. Try again later." });
          const db = req.db!;
          req.db = null;
          try {
            await db.query("COMMIT");
          } finally {
            db.release();
          }
          const walking = await options.liveGeo.navigate(input.points);
          const hours =
            walking && input.stops
              ? await checkHours(options.liveGeo, input.stops, walking)
              : undefined;
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
          if (!walking)
            return reply
              .code(422)
              .send({
                error:
                  "No suitable walking route connects these stops. Choose another detour.",
              });
          if(hours?.some(h=>h.venueStatus==='unsuitable'))return reply.code(422).send({error:'A stop no longer matches a suitable visit venue. Choose a replacement or another detour.'});
          if (hours?.some((h) => h.status === "closed"))
            return reply
              .code(422)
              .send({
                error:
                  "A stop is reported closed during your planned visit. Choose another detour.",
              });
          if (kind === "walking-route") return walking;
          const { legs, distance, duration, provider, checkedAt, warnings } =
            walking;
          return {
            legs,
            distance,
            duration,
            provider,
            checkedAt,
            warnings,
            hours,
          };
        });
      const upgraded=async(req:any,reply:any)=>{
        if(req.headers['x-quavi-rewards']==='1'){await ensureOutings(req.db,req.uid);await ensureRewards(req.db,req.uid,true);return true}
        if(await rewardsActive(req.db,req.uid)){reply.code(409).send({error:'Update Quavi to sync server-owned rewards.'});return false}
        return true
      };
      api.get('/me/outings',async req=>{
        const outings=await listOutings(req.db!,req.uid);
        if(req.headers['x-quavi-rewards']!=='1')return {outings};
        await ensureRewards(req.db!,req.uid,true);
        const sums=await req.db!.query('SELECT outing_id,sum(xp_delta)::integer AS xp FROM reward_ledger WHERE user_id=$1 GROUP BY outing_id',[req.uid]);
        return {outings:outings.map(r=>({...r,tripXp:sums.rows.find(x=>x.outing_id===r.id)?.xp??0})),rewards:await rewardState(req.db!,req.uid)}
      });
      api.post('/me/outings/operations',async(req,reply)=>{
        if(!await upgraded(req,reply))return;
        const result=await applyOutingOperation(req.db!,req.uid,req.body);
        return req.headers['x-quavi-rewards']==='1'?{...result,rewardState:await rewardState(req.db!,req.uid)}:result
      });
      api.get('/me/rewards',async req=>{await ensureOutings(req.db!,req.uid);await ensureRewards(req.db!,req.uid,true);return rewardState(req.db!,req.uid)});
      api.post('/me/rewards/redemptions',async req=>{await ensureOutings(req.db!,req.uid);return redeem(req.db!,req.uid,req.body)});
      api.get('/me/state',async req=>{
        const stored=await readState(req.db!,req.uid);
        if(!stored)return {state:null,revision:0,updatedAt:null};
        if(await rewardsActive(req.db!,req.uid)){const rewards=await rewardState(req.db!,req.uid);stored.state={...stored.state,demoRedemptions:rewards.redemptions,game:{...(stored.state.game as object),xp:rewards.xp,coins:rewards.coins,streak:rewards.streak,badges:rewards.badges}}}
        return stored
      });
      api.put("/me/state", async (req, reply) => {
        if(!await upgraded(req,reply))return;
        const { state, revision } = stateInput.parse(
            scrubGoogleContent(req.body),
          ),
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
        if(req.headers['x-quavi-outings']==='1')await ensureOutings(req.db!,req.uid);
        else if((await req.db!.query('SELECT 1 FROM outing_accounts WHERE user_id=$1',[req.uid])).rowCount)
          return reply.code(409).send({error:'Update Quavi before saving this account. Outings now sync separately.'});
        if(await rewardsActive(req.db!,req.uid)){const rewards=await rewardState(req.db!,req.uid);state.demoRedemptions=rewards.redemptions;Object.assign(state.game,{xp:rewards.xp,coins:rewards.coins,streak:rewards.streak,badges:rewards.badges})}
        const saved = await writeState(
          req.db!,
          req.uid,
          scrubGoogleContent(state),
          revision,
        );
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
      api.get('/me/social',async req=>({...await social.socialState(req.db!,req.uid),canModerate:req.moderator}));
      api.get('/me/social/feed',async req=>social.feedPage(req.db!,req.uid,(req.query as any).cursor));
      api.get('/me/social/notifications',async req=>delivery.inbox(req.db!,req.uid,(req.query as any).cursor));
      api.post('/me/social/notifications/read',async req=>delivery.markRead(req.db!,req.uid,req.body));
      api.put('/me/social/devices',async req=>delivery.registerDevice(req.db!,req.uid,req.body));
      api.delete('/me/social/devices',async req=>delivery.removeDevice(req.db!,req.uid,req.body));
      api.get('/me/social/push-status',async()=>({configured:process.env.APNS_PUSH_ENABLED==='true'}));
      const staff=(req:any)=>{if(!req.moderator)throw new social.SocialError(403,'Moderator access required.');};
      api.get('/me/social/moderation',async req=>{staff(req);return delivery.moderationQueue(req.db!,(req.query as any).cursor)});
      api.get('/me/social/moderation/:id',async req=>{staff(req);return delivery.moderationEvidence(req.db!,(req.params as any).id)});
      api.get('/me/social/moderation/:id/media/:mediaId',async(req,reply)=>{staff(req);const p=req.params as any;const key=await delivery.moderationMedia(req.db!,p.id,p.mediaId);if(!options.media)return reply.code(503).send({error:'Photo storage unavailable'});return {url:await options.media.read(key),expiresInSeconds:300}});
      api.post('/me/social/moderation',async req=>{staff(req);return delivery.moderate(req.db!,req.uid,req.body)});
      api.put('/me/social/profile',async req=>social.setHandle(req.db!,req.uid,req.body));
      api.post('/me/social/lookup',async(req,reply)=>{if(!await quota(req.db!,ownerHash(req.uid),'social-lookup',30,3600))return reply.code(429).send({error:'Too many searches. Try again later.'});return social.lookup(req.db!,req.uid,req.body)});
      api.post('/me/social/relationships',async(req,reply)=>{if((req.body as any)?.action==='request'&&!await quota(req.db!,ownerHash(req.uid),'social-request',30,3600))return reply.code(429).send({error:'Too many friend requests. Try again later.'});return social.relationship(req.db!,req.uid,req.body)});
      api.post('/me/social/posts',async(req,reply)=>{if(!await quota(req.db!,ownerHash(req.uid),'social-publish',20,86400))return reply.code(429).send({error:'Sharing limit reached. Try again tomorrow.'});return social.publish(req.db!,req.uid,req.body)});
      api.get('/me/social/posts/:id',async req=>social.readPost(req.db!,req.uid,(req.params as any).id));
      api.delete('/me/social/posts/:id',async req=>social.unpublish(req.db!,req.uid,(req.params as any).id));
      api.post('/me/social/reports',async(req,reply)=>{if(!await quota(req.db!,ownerHash(req.uid),'social-report',10,86400))return reply.code(429).send({error:'Report limit reached. You can still block this person.'});return social.report(req.db!,req.uid,req.body)});
      api.get('/me/social/posts/:id/media/:mediaId',async(req,reply)=>{const p=req.params as any;const key=await social.sharedMedia(req.db!,req.uid,p.id,p.mediaId);if(!options.media)return reply.code(503).send({error:'Photo storage unavailable'});return {url:await options.media.read(key),expiresInSeconds:300}});
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
