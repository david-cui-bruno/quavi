ALTER TABLE social_relationships ADD COLUMN request_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE social_posts ADD COLUMN hidden_at timestamptz;
ALTER TABLE social_reports ADD COLUMN status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved'));
ALTER TABLE social_reports ADD COLUMN resolution text;
ALTER TABLE social_reports ADD COLUMN resolved_at timestamptz;
CREATE TABLE social_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 recipient text NOT NULL REFERENCES social_profiles(user_id) ON DELETE CASCADE,
 actor text NOT NULL REFERENCES social_profiles(user_id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('friend_request','friend_accepted','story_shared','report_update')),
 event_key text NOT NULL,
 post_id uuid REFERENCES social_posts(id) ON DELETE CASCADE,
 report_id uuid REFERENCES social_reports(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 read_at timestamptz,
 UNIQUE(recipient,kind,event_key)
);
CREATE INDEX social_inbox ON social_notifications(recipient,created_at DESC,id DESC);
CREATE TABLE social_restrictions (
 user_id text PRIMARY KEY REFERENCES social_profiles(user_id) ON DELETE CASCADE,
 until_at timestamptz NOT NULL,
 reason text NOT NULL
);
CREATE TABLE moderation_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 report_id uuid NOT NULL REFERENCES social_reports(id) ON DELETE CASCADE,
 moderator text NOT NULL,
 action text NOT NULL CHECK(action IN ('dismiss','hide_story','restrict_user')),
 note text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE push_devices (
 token text PRIMARY KEY,
 user_id text NOT NULL REFERENCES social_profiles(user_id) ON DELETE CASCADE,
 environment text NOT NULL CHECK(environment IN ('production','sandbox')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_devices_owner ON push_devices(user_id);
CREATE TABLE push_deliveries (
 notification_id uuid NOT NULL REFERENCES social_notifications(id) ON DELETE CASCADE,
 token text NOT NULL REFERENCES push_devices(token) ON DELETE CASCADE,
 attempts integer NOT NULL DEFAULT 0,
 retry_at timestamptz NOT NULL DEFAULT now(),
 sent_at timestamptz,
 PRIMARY KEY(notification_id,token)
);
CREATE TABLE social_hidden_outings (
 user_id text NOT NULL,
 outing_id text NOT NULL,
 PRIMARY KEY(user_id,outing_id),
 FOREIGN KEY(user_id,outing_id) REFERENCES outings(user_id,id) ON DELETE CASCADE
);
