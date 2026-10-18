CREATE TABLE venue_cache (
  area_key text PRIMARY KEY,
  document jsonb NOT NULL,
  source_updated_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours'
);
