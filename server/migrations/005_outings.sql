CREATE TABLE outing_accounts (
  user_id text PRIMARY KEY,
  migrated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE outings (
  user_id text NOT NULL,
  id text NOT NULL,
  document jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,id)
);
CREATE TABLE outing_operations (
  user_id text NOT NULL,
  operation_id uuid NOT NULL,
  outing_id text NOT NULL,
  fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,operation_id),
  FOREIGN KEY(user_id,outing_id) REFERENCES outings(user_id,id) ON DELETE CASCADE
);
