CREATE TABLE social_profiles (
 user_id text PRIMARY KEY,
 public_id uuid NOT NULL UNIQUE,
 handle text NOT NULL UNIQUE CHECK(handle ~ '^[a-z][a-z0-9_]{2,23}$'),
 name text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE social_relationships (
 low_id text NOT NULL REFERENCES social_profiles(user_id) ON DELETE CASCADE,
 high_id text NOT NULL REFERENCES social_profiles(user_id) ON DELETE CASCADE,
 requester text NOT NULL REFERENCES social_profiles(user_id) ON DELETE CASCADE,
 state text NOT NULL CHECK(state IN ('pending','accepted')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(low_id,high_id), CHECK(low_id COLLATE "C" < high_id COLLATE "C"),
 CHECK(requester=low_id OR requester=high_id)
);
CREATE INDEX social_relationships_high ON social_relationships(high_id);
CREATE TABLE social_blocks (
 user_id text NOT NULL REFERENCES social_profiles(user_id) ON DELETE CASCADE,
 target_id text NOT NULL REFERENCES social_profiles(user_id) ON DELETE CASCADE,
 PRIMARY KEY(user_id,target_id), CHECK(user_id<>target_id)
);
CREATE TABLE social_posts (
 id uuid PRIMARY KEY,
 user_id text NOT NULL REFERENCES social_profiles(user_id) ON DELETE CASCADE,
 outing_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,outing_id),
 FOREIGN KEY(user_id,outing_id) REFERENCES outings(user_id,id) ON DELETE CASCADE
);
CREATE INDEX social_posts_recent ON social_posts(created_at DESC);
CREATE TABLE social_reports (
 id uuid PRIMARY KEY,
 reporter text NOT NULL REFERENCES social_profiles(user_id) ON DELETE CASCADE,
 target_id text NOT NULL REFERENCES social_profiles(user_id) ON DELETE CASCADE,
 post_id uuid REFERENCES social_posts(id) ON DELETE SET NULL,
 reason text NOT NULL CHECK(reason IN ('spam','harassment','unsafe','other')),
 details text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now()
);
