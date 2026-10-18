CREATE TABLE account_deletions (
  owner_hash text PRIMARY KEY,
  user_id text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  finalize_after timestamptz NOT NULL DEFAULT now() + interval '11 minutes',
  scrubbed_at timestamptz,
  completed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  retry_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deletion_work ON account_deletions(retry_at) WHERE completed_at IS NULL;
CREATE TABLE request_quotas (
  owner_hash text NOT NULL,
  category text NOT NULL,
  window_at timestamptz NOT NULL,
  used integer NOT NULL,
  PRIMARY KEY(owner_hash, category, window_at)
);
ALTER TABLE media_objects ADD COLUMN bytes integer CHECK(bytes > 0 AND bytes <= 8388608);
ALTER TABLE media_objects ADD COLUMN uploaded_at timestamptz;
