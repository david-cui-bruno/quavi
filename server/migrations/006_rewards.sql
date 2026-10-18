CREATE TABLE reward_accounts (
  user_id text PRIMARY KEY,
  legacy_xp integer NOT NULL DEFAULT 0,
  legacy_coins integer NOT NULL DEFAULT 0,
  legacy_streak integer NOT NULL DEFAULT 0,
  legacy_badges jsonb NOT NULL DEFAULT '[]',
  legacy_redemptions jsonb NOT NULL DEFAULT '[]',
  activated_at timestamptz
);
-- Freeze old demo history at deployment. It preserves presentation, never spendable credit.
INSERT INTO reward_accounts(user_id,legacy_xp,legacy_coins,legacy_streak,legacy_badges,legacy_redemptions)
SELECT user_id,coalesce((document#>>'{game,xp}')::integer,0),coalesce((document#>>'{game,coins}')::integer,0),coalesce((document#>>'{game,streak}')::integer,0),coalesce(document#>'{game,badges}','[]'::jsonb),coalesce(document->'demoRedemptions','[]'::jsonb) FROM user_state;
CREATE TABLE reward_plans (
 user_id text NOT NULL,
 outing_id text NOT NULL,
 chapter integer NOT NULL,
 document jsonb NOT NULL,
 PRIMARY KEY(user_id,outing_id,chapter),
 FOREIGN KEY(user_id,outing_id) REFERENCES outings(user_id,id) ON DELETE CASCADE
);
CREATE TABLE reward_ledger (
 user_id text NOT NULL,
 event_key text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('task','chapter','coin','redeem','baseline')),
 outing_id text,
 xp_delta integer NOT NULL DEFAULT 0 CHECK(xp_delta BETWEEN 0 AND 25),
 coin_delta integer NOT NULL DEFAULT 0 CHECK(coin_delta BETWEEN 0 AND 5),
 reward_delta integer NOT NULL DEFAULT 0 CHECK(reward_delta BETWEEN -1 AND 0),
 badge text,
 offer_id text,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,event_key),
 FOREIGN KEY(user_id) REFERENCES reward_accounts(user_id) ON DELETE CASCADE
);
CREATE INDEX reward_ledger_day ON reward_ledger(user_id,created_at);
CREATE TABLE reward_requests (
 user_id text NOT NULL,
 operation_id uuid NOT NULL,
 offer_id text NOT NULL,
 PRIMARY KEY(user_id,operation_id),
 FOREIGN KEY(user_id) REFERENCES reward_accounts(user_id) ON DELETE CASCADE
);
