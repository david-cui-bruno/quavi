import type pg from "pg";
import { z } from "zod";
import {
  rewardPlan,
  TRIP_XP_CAP,
  DAILY_XP_CAP,
  type RuleStory,
} from "./reward-rules.js";
import type { Outing } from "./outings.js";
const fail = (statusCode: number, message: string) =>
  Object.assign(new Error(message), { statusCode });
const OFFERS = { welcome: 0, cafe: 1, books: 1 } as const;
export const redeemInput = z
  .object({
    operationId: z.uuid(),
    offerId: z.enum(["welcome", "cafe", "books"]),
  })
  .strict();
export async function rewardsActive(db: pg.PoolClient, uid: string) {
  return !!(
    await db.query(
      "SELECT 1 FROM reward_accounts WHERE user_id=$1 AND activated_at IS NOT NULL",
      [uid],
    )
  ).rowCount;
}
async function baseline(db: pg.PoolClient, uid: string) {
  const { rows } = await db.query(
    "SELECT id,document FROM outings WHERE user_id=$1",
    [uid],
  );
  for (const row of rows) {
    const r = row.document as Outing;
    for (const [key, on] of Object.entries(r.tasks))
      if (on)
        await db.query(
          "INSERT INTO reward_ledger(user_id,event_key,kind,outing_id) VALUES($1,$2,'baseline',$3) ON CONFLICT DO NOTHING",
          [uid, `task:${r.id}:${key}`, r.id],
        );
    for (const [key, on] of Object.entries(r.collected))
      if (on)
        await db.query(
          "INSERT INTO reward_ledger(user_id,event_key,kind,outing_id) VALUES($1,$2,'baseline',$3) ON CONFLICT DO NOTHING",
          [uid, `coin:${r.id}:${key}`, r.id],
        );
    for (let i = 0; i < r.story.chapters.length; i++)
      if (r.tasks[`${i}!/cleared`])
        await db.query(
          "INSERT INTO reward_ledger(user_id,event_key,kind,outing_id) VALUES($1,$2,'baseline',$3) ON CONFLICT DO NOTHING",
          [uid, `chapter:${r.id}:${i}`, r.id],
        );
  }
}
export async function ensureRewards(
  db: pg.PoolClient,
  uid: string,
  activate = false,
) {
  await db.query(
    "INSERT INTO reward_accounts(user_id) VALUES($1) ON CONFLICT DO NOTHING",
    [uid],
  );
  if (activate) {
    const activated = await db.query(
      "UPDATE reward_accounts SET activated_at=now() WHERE user_id=$1 AND activated_at IS NULL RETURNING user_id",
      [uid],
    );
    if (activated.rowCount) await baseline(db, uid);
  }
}
export async function rewardState(db: pg.PoolClient, uid: string) {
  const {
    rows: [account],
  } = await db.query("SELECT * FROM reward_accounts WHERE user_id=$1", [uid]);
  const {
    rows: [sums],
  } = await db.query(
    `SELECT coalesce(sum(xp_delta),0)::integer AS xp,coalesce(sum(coin_delta),0)::integer AS coins,coalesce(sum(reward_delta),0)::integer AS spent,coalesce(sum(xp_delta) FILTER(WHERE created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),0)::integer AS today FROM reward_ledger WHERE user_id=$1`,
    [uid],
  );
  const { rows: badges } = await db.query(
    "SELECT DISTINCT badge FROM reward_ledger WHERE user_id=$1 AND badge IS NOT NULL",
    [uid],
  );
  const { rows: used } = await db.query(
    'SELECT offer_id AS "offerId",created_at AS "redeemedAt" FROM reward_ledger WHERE user_id=$1 AND kind=\'redeem\' ORDER BY created_at',
    [uid],
  );
  const historical = (account?.legacy_redemptions ?? []).filter(
    (r: any) => r && r.offerId in OFFERS,
  );
  return {
    dailyRemaining: Math.max(0, DAILY_XP_CAP - sums.today),
    dailyLimit: DAILY_XP_CAP,
    confirmedXp: sums.xp,
    legacyXp: account?.legacy_xp ?? 0,
    xp: sums.xp + (account?.legacy_xp ?? 0),
    coins: sums.coins + (account?.legacy_coins ?? 0),
    streak: account?.legacy_streak ?? 0,
    badges: [
      ...new Set([
        ...(account?.legacy_badges ?? []),
        ...badges.map((r) => r.badge),
      ]),
    ],
    balance: Math.max(0, Math.floor(sums.xp / 1000) + sums.spent),
    redemptions: [
      ...historical,
      ...used
        .filter((r) => !historical.some((h: any) => h.offerId === r.offerId))
        .map((r) => ({ ...r, redeemedAt: r.redeemedAt.toISOString() })),
    ],
  };
}
/** Confirmation is self-reported demo participation, not proof of a purchase or physical visit. */
export async function awardOuting(db: pg.PoolClient, uid: string, r: Outing) {
  if (!(await rewardsActive(db, uid))) return r.tripXp;
  const p = r.story.prefs as RuleStory["prefs"];
  const plan = rewardPlan({
    chapters: r.story.chapters,
    prefs: p && typeof p === "object" ? p : undefined,
  });
  let {
    rows: [totals],
  } = await db.query(
    `SELECT coalesce(sum(xp_delta) FILTER(WHERE outing_id=$2),0)::integer AS trip,coalesce(sum(xp_delta) FILTER(WHERE created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),0)::integer AS day,coalesce(sum(coin_delta) FILTER(WHERE created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),0)::integer AS coins FROM reward_ledger WHERE user_id=$1`,
    [uid, r.id],
  );
  async function add(
    key: string,
    kind: string,
    xp = 0,
    coins = 0,
    badge?: string,
  ) {
    const give = Math.max(
        0,
        Math.min(xp, TRIP_XP_CAP - totals.trip, DAILY_XP_CAP - totals.day),
      ),
      coinGive = Math.max(0, Math.min(coins, 100 - totals.coins));
    const result = await db.query(
      "INSERT INTO reward_ledger(user_id,event_key,kind,outing_id,xp_delta,coin_delta,badge) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING event_key",
      [uid, key, kind, r.id, give, coinGive, badge ?? null],
    );
    if (result.rowCount) {
      totals.trip += give;
      totals.day += give;
      totals.coins += coinGive;
    }
  }
  if (["active", "paused", "completed"].includes(r.status))
    for (let i = 0; i < plan.length; i++) {
      if (
        !Array.isArray(r.story.arrivedStops) ||
        !r.story.arrivedStops.includes(i)
      )
        continue;
      const {
        rows: [frozen],
      } = await db.query(
        "SELECT document FROM reward_plans WHERE user_id=$1 AND outing_id=$2 AND chapter=$3",
        [uid, r.id, i],
      );
      const selected = frozen?.document ?? plan[i];
      if (!selected.tasks.some((t: any) => r.tasks[`${i}/${t.id}`])) continue;
      await db.query(
        "INSERT INTO reward_plans(user_id,outing_id,chapter,document) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
        [uid, r.id, i, selected],
      );
      for (const task of selected.tasks)
        if (r.tasks[`${i}/${task.id}`])
          await add(`task:${r.id}:${i}/${task.id}`, "task", task.xp);
      if (selected.tasks.every((t: any) => r.tasks[`${i}/${t.id}`]))
        await add(`chapter:${r.id}:${i}`, "chapter", 0, 5, selected.badge);
    }
  if (["active", "paused", "completed"].includes(r.status))
    for (let i = 0; i < r.story.chapters.length; i++)
      for (const n of [i * 10 + 4, i * 10 + 7])
        if (r.collected[String(n)])
          await add(`coin:${r.id}:${n}`, "coin", 0, 1);
  return totals.trip as number;
}
export async function redeem(db: pg.PoolClient, uid: string, input: unknown) {
  const op = redeemInput.parse(input);
  await ensureRewards(db, uid, true);
  const {
    rows: [previous],
  } = await db.query(
    "SELECT offer_id FROM reward_requests WHERE user_id=$1 AND operation_id=$2",
    [uid, op.operationId],
  );
  if (previous && previous.offer_id !== op.offerId)
    throw fail(409, "This request was already used for another offer");
  const state = await rewardState(db, uid);
  if (previous) return state;
  if (!state.redemptions.some((r: any) => r.offerId === op.offerId)) {
    const cost = OFFERS[op.offerId];
    if (state.balance < cost)
      throw fail(
        422,
        "Not enough confirmed rewards yet. Sync your tasks and try again.",
      );
    await db.query(
      "INSERT INTO reward_ledger(user_id,event_key,kind,reward_delta,offer_id) VALUES($1,$2,'redeem',$3,$4) ON CONFLICT DO NOTHING",
      [uid, "redeem:" + op.offerId, -cost, op.offerId],
    );
  }
  await db.query(
    "INSERT INTO reward_requests(user_id,operation_id,offer_id) VALUES($1,$2,$3)",
    [uid, op.operationId, op.offerId],
  );
  return rewardState(db, uid);
}
