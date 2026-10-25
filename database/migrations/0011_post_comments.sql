-- Private discussions on an account's own community posts. No public messaging.
BEGIN;
CREATE TABLE post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  workspace_key text NOT NULL CHECK(length(workspace_key) BETWEEN 1 AND 240),
  client_key text NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  position int NOT NULL DEFAULT 0 CHECK(position>=0),
  ui_payload jsonb NOT NULL CHECK(octet_length(ui_payload::text)<=900000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  post_id uuid NOT NULL,
  parent_client_key text CHECK(length(parent_client_key) BETWEEN 1 AND 160),
  body text NOT NULL,
  UNIQUE(user_id,workspace_key,client_key),
  UNIQUE(id,user_id),
  FOREIGN KEY(post_id,user_id) REFERENCES posts(id,user_id) ON DELETE CASCADE
);
CREATE INDEX post_comments_owner ON post_comments(user_id,workspace_key,position,id);
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_comments FORCE ROW LEVEL SECURITY;
CREATE POLICY post_comments_self ON post_comments TO campus_web
  USING(user_id=app.current_user_id()) WITH CHECK(user_id=app.current_user_id());
GRANT SELECT,INSERT,UPDATE,DELETE ON post_comments TO campus_web;
-- reset_private_workspace already deletes owned posts; this FK cascades their
-- discussions in the same transaction and preserves every other account.
COMMIT;
