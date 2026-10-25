-- Resource storage for the extended workspace. Apply as migration owner after 0005.
-- Each collection item has its own typed resource row; revisions never contain values.
BEGIN;
ALTER TABLE applications ADD CONSTRAINT applications_id_user_unique UNIQUE(id,user_id);
CREATE TABLE workspace_revisions (
 user_id uuid NOT NULL REFERENCES users(id), key text NOT NULL CHECK(length(key) BETWEEN 1 AND 240),
 version int NOT NULL CHECK(version>0), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,key)
);
ALTER TABLE experiences ADD COLUMN client_key text, ADD COLUMN ui_payload jsonb,
 ADD COLUMN workspace_key text, ADD COLUMN workspace_position int NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX experiences_author_client_key ON experiences(author_id,client_key) WHERE client_key IS NOT NULL;
CREATE POLICY experiences_self_insert ON experiences FOR INSERT TO campus_web WITH CHECK(author_id=app.current_user_id() AND source_id IS NULL AND content_mode='user_original');
CREATE POLICY experiences_self_update ON experiences FOR UPDATE TO campus_web USING(author_id=app.current_user_id() AND source_id IS NULL) WITH CHECK(author_id=app.current_user_id() AND source_id IS NULL AND content_mode='user_original');
CREATE POLICY experiences_self_delete ON experiences FOR DELETE TO campus_web USING(author_id=app.current_user_id() AND source_id IS NULL);
GRANT INSERT,UPDATE,DELETE ON experiences TO campus_web;
CREATE TABLE resumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  workspace_key text NOT NULL CHECK(length(workspace_key) BETWEEN 1 AND 240),
  client_key text NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  position int NOT NULL DEFAULT 0 CHECK(position>=0),
  ui_payload jsonb NOT NULL CHECK(octet_length(ui_payload::text)<=900000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,workspace_key,client_key), UNIQUE(id,user_id),
  name text NOT NULL, version int NOT NULL CHECK(version>0), mime_type text NOT NULL, size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 0 AND 10485760), parsed_text text NOT NULL, role text NOT NULL, is_default boolean NOT NULL DEFAULT false
);
CREATE INDEX resumes_owner ON resumes(user_id,workspace_key,position,id);
CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  workspace_key text NOT NULL CHECK(length(workspace_key) BETWEEN 1 AND 240),
  client_key text NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  position int NOT NULL DEFAULT 0 CHECK(position>=0),
  ui_payload jsonb NOT NULL CHECK(octet_length(ui_payload::text)<=900000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,workspace_key,client_key), UNIQUE(id,user_id),
  name text NOT NULL, conditions jsonb NOT NULL, channels jsonb NOT NULL, frequency text NOT NULL, enabled boolean NOT NULL
);
CREATE INDEX subscriptions_owner ON subscriptions(user_id,workspace_key,position,id);
CREATE TABLE referral_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  workspace_key text NOT NULL CHECK(length(workspace_key) BETWEEN 1 AND 240),
  client_key text NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  position int NOT NULL DEFAULT 0 CHECK(position>=0),
  ui_payload jsonb NOT NULL CHECK(octet_length(ui_payload::text)<=900000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,workspace_key,client_key), UNIQUE(id,user_id),
  company_id uuid REFERENCES companies(id), title text NOT NULL, contact text NOT NULL, code text CHECK(length(code)<=200), requested_role text CHECK(length(requested_role)<=120), status text NOT NULL, requested_date text NOT NULL, note text NOT NULL
);
CREATE INDEX referral_requests_owner ON referral_requests(user_id,workspace_key,position,id);
CREATE TABLE calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  workspace_key text NOT NULL CHECK(length(workspace_key) BETWEEN 1 AND 240),
  client_key text NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  position int NOT NULL DEFAULT 0 CHECK(position>=0),
  ui_payload jsonb NOT NULL CHECK(octet_length(ui_payload::text)<=900000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,workspace_key,client_key), UNIQUE(id,user_id),
  application_id uuid, company_id uuid REFERENCES companies(id), title text NOT NULL, scheduled_start timestamptz NOT NULL, duration_minutes int NOT NULL CHECK(duration_minutes BETWEEN 0 AND 480), event_type text NOT NULL, completed boolean NOT NULL, FOREIGN KEY(application_id,user_id) REFERENCES applications(id,user_id)
);
CREATE INDEX calendar_events_owner ON calendar_events(user_id,workspace_key,position,id);
CREATE TABLE plan_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  workspace_key text NOT NULL CHECK(length(workspace_key) BETWEEN 1 AND 240),
  client_key text NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  position int NOT NULL DEFAULT 0 CHECK(position>=0),
  ui_payload jsonb NOT NULL CHECK(octet_length(ui_payload::text)<=900000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,workspace_key,client_key), UNIQUE(id,user_id),
  title text NOT NULL, due_date date
);
CREATE INDEX plan_milestones_owner ON plan_milestones(user_id,workspace_key,position,id);
CREATE TABLE plan_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  workspace_key text NOT NULL CHECK(length(workspace_key) BETWEEN 1 AND 240),
  client_key text NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  position int NOT NULL DEFAULT 0 CHECK(position>=0),
  ui_payload jsonb NOT NULL CHECK(octet_length(ui_payload::text)<=900000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,workspace_key,client_key), UNIQUE(id,user_id),
  milestone_id uuid, title text NOT NULL, status text NOT NULL CHECK(status IN ('待开始','进行中','已完成')), due_date date, remind boolean NOT NULL, FOREIGN KEY(milestone_id,user_id) REFERENCES plan_milestones(id,user_id) ON DELETE SET NULL (milestone_id)
);
CREATE INDEX plan_tasks_owner ON plan_tasks(user_id,workspace_key,position,id);
CREATE TABLE plan_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  workspace_key text NOT NULL CHECK(length(workspace_key) BETWEEN 1 AND 240),
  client_key text NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  position int NOT NULL DEFAULT 0 CHECK(position>=0),
  ui_payload jsonb NOT NULL CHECK(octet_length(ui_payload::text)<=900000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,workspace_key,client_key), UNIQUE(id,user_id),
  task_client_key text NOT NULL, reminded_date text NOT NULL
);
CREATE INDEX plan_reminders_owner ON plan_reminders(user_id,workspace_key,position,id);
CREATE TABLE offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  workspace_key text NOT NULL CHECK(length(workspace_key) BETWEEN 1 AND 240),
  client_key text NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  position int NOT NULL DEFAULT 0 CHECK(position>=0),
  ui_payload jsonb NOT NULL CHECK(octet_length(ui_payload::text)<=900000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,workspace_key,client_key), UNIQUE(id,user_id),
  application_id uuid, title text NOT NULL, company_name text NOT NULL, city text NOT NULL, currency char(3) NOT NULL DEFAULT 'CNY', version int NOT NULL DEFAULT 1, base_monthly_minor bigint, salary_months numeric, bonus_minor bigint, deadline_at date, dimensions jsonb NOT NULL, note text NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','expired')), FOREIGN KEY(application_id,user_id) REFERENCES applications(id,user_id)
);
CREATE INDEX offers_owner ON offers(user_id,workspace_key,position,id);
CREATE TABLE offer_comparisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  workspace_key text NOT NULL CHECK(length(workspace_key) BETWEEN 1 AND 240),
  client_key text NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  position int NOT NULL DEFAULT 0 CHECK(position>=0),
  ui_payload jsonb NOT NULL CHECK(octet_length(ui_payload::text)<=900000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,workspace_key,client_key), UNIQUE(id,user_id),
  name text NOT NULL, weight numeric NOT NULL CHECK(weight BETWEEN 0 AND 100)
);
CREATE INDEX offer_comparisons_owner ON offer_comparisons(user_id,workspace_key,position,id);
CREATE TABLE salary_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  workspace_key text NOT NULL CHECK(length(workspace_key) BETWEEN 1 AND 240),
  client_key text NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  position int NOT NULL DEFAULT 0 CHECK(position>=0),
  ui_payload jsonb NOT NULL CHECK(octet_length(ui_payload::text)<=900000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,workspace_key,client_key), UNIQUE(id,user_id),
  company_id uuid REFERENCES companies(id), role text NOT NULL, city text NOT NULL, year int NOT NULL CHECK(year BETWEEN 2000 AND 2099), level text NOT NULL, currency char(3) NOT NULL DEFAULT 'CNY', base_monthly_minor bigint, salary_months numeric, bonus_minor bigint, verification text NOT NULL DEFAULT 'self_reported', sample_note text NOT NULL
);
CREATE INDEX salary_reports_owner ON salary_reports(user_id,workspace_key,position,id);
CREATE TABLE interview_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  workspace_key text NOT NULL CHECK(length(workspace_key) BETWEEN 1 AND 240),
  client_key text NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  position int NOT NULL DEFAULT 0 CHECK(position>=0),
  ui_payload jsonb NOT NULL CHECK(octet_length(ui_payload::text)<=900000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,workspace_key,client_key), UNIQUE(id,user_id),
  application_id uuid NOT NULL, sequence int NOT NULL CHECK(sequence>0), round_type text NOT NULL DEFAULT 'other', title text NOT NULL, scheduled_start timestamptz, status text NOT NULL CHECK(status IN ('scheduled','completed','cancelled')), mode text NOT NULL, timezone text NOT NULL DEFAULT 'Asia/Shanghai', questions text NOT NULL, private_notes text NOT NULL, FOREIGN KEY(application_id,user_id) REFERENCES applications(id,user_id), UNIQUE(application_id,sequence)
);
CREATE INDEX interview_rounds_owner ON interview_rounds(user_id,workspace_key,position,id);
CREATE TABLE interview_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  workspace_key text NOT NULL CHECK(length(workspace_key) BETWEEN 1 AND 240),
  client_key text NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  position int NOT NULL DEFAULT 0 CHECK(position>=0),
  ui_payload jsonb NOT NULL CHECK(octet_length(ui_payload::text)<=900000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,workspace_key,client_key), UNIQUE(id,user_id),
  interview_round_id uuid NOT NULL, transcript text NOT NULL, private_notes text NOT NULL, self_score int NOT NULL CHECK(self_score BETWEEN 1 AND 5), recording_client_key text, manual_scores jsonb NOT NULL, analysis jsonb, UNIQUE(interview_round_id), FOREIGN KEY(interview_round_id,user_id) REFERENCES interview_rounds(id,user_id) ON DELETE CASCADE
);
CREATE INDEX interview_reviews_owner ON interview_reviews(user_id,workspace_key,position,id);
CREATE TABLE mock_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  workspace_key text NOT NULL CHECK(length(workspace_key) BETWEEN 1 AND 240),
  client_key text NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  position int NOT NULL DEFAULT 0 CHECK(position>=0),
  ui_payload jsonb NOT NULL CHECK(octet_length(ui_payload::text)<=900000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,workspace_key,client_key), UNIQUE(id,user_id),
  state text NOT NULL CHECK(state IN ('active','completed')), configuration jsonb NOT NULL, started_at timestamptz, finished_at timestamptz, report jsonb
);
CREATE INDEX mock_sessions_owner ON mock_sessions(user_id,workspace_key,position,id);
CREATE TABLE experience_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  workspace_key text NOT NULL CHECK(length(workspace_key) BETWEEN 1 AND 240),
  client_key text NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  position int NOT NULL DEFAULT 0 CHECK(position>=0),
  ui_payload jsonb NOT NULL CHECK(octet_length(ui_payload::text)<=900000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,workspace_key,client_key), UNIQUE(id,user_id),
  experience_client_key text NOT NULL, title text NOT NULL, body_md text NOT NULL, role text NOT NULL, company_id uuid REFERENCES companies(id)
);
CREATE INDEX experience_drafts_owner ON experience_drafts(user_id,workspace_key,position,id);
CREATE TABLE question_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  workspace_key text NOT NULL CHECK(length(workspace_key) BETWEEN 1 AND 240),
  client_key text NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  position int NOT NULL DEFAULT 0 CHECK(position>=0),
  ui_payload jsonb NOT NULL CHECK(octet_length(ui_payload::text)<=900000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,workspace_key,client_key), UNIQUE(id,user_id),
  question_key text NOT NULL, mastery text, is_wrong boolean NOT NULL, attempts int CHECK(attempts>=0)
);
CREATE INDEX question_progress_owner ON question_progress(user_id,workspace_key,position,id);
CREATE TABLE practice_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  workspace_key text NOT NULL CHECK(length(workspace_key) BETWEEN 1 AND 240),
  client_key text NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  position int NOT NULL DEFAULT 0 CHECK(position>=0),
  ui_payload jsonb NOT NULL CHECK(octet_length(ui_payload::text)<=900000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,workspace_key,client_key), UNIQUE(id,user_id),
  title text NOT NULL, source text NOT NULL
);
CREATE INDEX practice_collections_owner ON practice_collections(user_id,workspace_key,position,id);
CREATE TABLE question_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  workspace_key text NOT NULL CHECK(length(workspace_key) BETWEEN 1 AND 240),
  client_key text NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  position int NOT NULL DEFAULT 0 CHECK(position>=0),
  ui_payload jsonb NOT NULL CHECK(octet_length(ui_payload::text)<=900000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,workspace_key,client_key), UNIQUE(id,user_id),
  question_key text NOT NULL, answer_text text NOT NULL
);
CREATE INDEX question_answers_owner ON question_answers(user_id,workspace_key,position,id);
CREATE TABLE experience_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  workspace_key text NOT NULL CHECK(length(workspace_key) BETWEEN 1 AND 240),
  client_key text NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  position int NOT NULL DEFAULT 0 CHECK(position>=0),
  ui_payload jsonb NOT NULL CHECK(octet_length(ui_payload::text)<=900000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,workspace_key,client_key), UNIQUE(id,user_id),
  experience_id uuid NOT NULL REFERENCES experiences(id), parent_client_key text, body text NOT NULL, moderation_status text NOT NULL DEFAULT 'published' CHECK(moderation_status IN ('pending','published','hidden'))
);
CREATE INDEX experience_comments_owner ON experience_comments(user_id,workspace_key,position,id);
CREATE TABLE experience_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  workspace_key text NOT NULL CHECK(length(workspace_key) BETWEEN 1 AND 240),
  client_key text NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  position int NOT NULL DEFAULT 0 CHECK(position>=0),
  ui_payload jsonb NOT NULL CHECK(octet_length(ui_payload::text)<=900000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,workspace_key,client_key), UNIQUE(id,user_id),
  experience_id uuid NOT NULL REFERENCES experiences(id), summary text NOT NULL
);
CREATE INDEX experience_summaries_owner ON experience_summaries(user_id,workspace_key,position,id);
CREATE TABLE experience_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  workspace_key text NOT NULL CHECK(length(workspace_key) BETWEEN 1 AND 240),
  client_key text NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  position int NOT NULL DEFAULT 0 CHECK(position>=0),
  ui_payload jsonb NOT NULL CHECK(octet_length(ui_payload::text)<=900000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,workspace_key,client_key), UNIQUE(id,user_id),
  experience_id uuid NOT NULL REFERENCES experiences(id), reaction text NOT NULL DEFAULT 'like' CHECK(reaction='like')
);
CREATE INDEX experience_reactions_owner ON experience_reactions(user_id,workspace_key,position,id);
CREATE TABLE handbook_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  workspace_key text NOT NULL CHECK(length(workspace_key) BETWEEN 1 AND 240),
  client_key text NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  position int NOT NULL DEFAULT 0 CHECK(position>=0),
  ui_payload jsonb NOT NULL CHECK(octet_length(ui_payload::text)<=900000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,workspace_key,client_key), UNIQUE(id,user_id),
  chapter_key text NOT NULL, body text NOT NULL, chapter_version int NOT NULL DEFAULT 1
);
CREATE INDEX handbook_notes_owner ON handbook_notes(user_id,workspace_key,position,id);
CREATE TABLE handbook_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  workspace_key text NOT NULL CHECK(length(workspace_key) BETWEEN 1 AND 240),
  client_key text NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  position int NOT NULL DEFAULT 0 CHECK(position>=0),
  ui_payload jsonb NOT NULL CHECK(octet_length(ui_payload::text)<=900000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,workspace_key,client_key), UNIQUE(id,user_id),
  template_key text NOT NULL, body text NOT NULL
);
CREATE INDEX handbook_templates_owner ON handbook_templates(user_id,workspace_key,position,id);
CREATE TABLE posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  workspace_key text NOT NULL CHECK(length(workspace_key) BETWEEN 1 AND 240),
  client_key text NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  position int NOT NULL DEFAULT 0 CHECK(position>=0),
  ui_payload jsonb NOT NULL CHECK(octet_length(ui_payload::text)<=900000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,workspace_key,client_key), UNIQUE(id,user_id),
  body_md text NOT NULL, tags text[] NOT NULL, visibility text NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','team')), status text NOT NULL DEFAULT 'published' CHECK(status IN ('pending','published','hidden','deleted'))
);
CREATE INDEX posts_owner ON posts(user_id,workspace_key,position,id);
CREATE TABLE content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  workspace_key text NOT NULL CHECK(length(workspace_key) BETWEEN 1 AND 240),
  client_key text NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  position int NOT NULL DEFAULT 0 CHECK(position>=0),
  ui_payload jsonb NOT NULL CHECK(octet_length(ui_payload::text)<=900000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,workspace_key,client_key), UNIQUE(id,user_id),
  target_client_key text NOT NULL, reason text NOT NULL, reported_date text NOT NULL
);
CREATE INDEX content_reports_owner ON content_reports(user_id,workspace_key,position,id);
CREATE TABLE buddy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  workspace_key text NOT NULL CHECK(length(workspace_key) BETWEEN 1 AND 240),
  client_key text NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  position int NOT NULL DEFAULT 0 CHECK(position>=0),
  ui_payload jsonb NOT NULL CHECK(octet_length(ui_payload::text)<=900000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,workspace_key,client_key), UNIQUE(id,user_id),
  candidate_client_key text NOT NULL, status text NOT NULL DEFAULT 'requested' 
);
CREATE INDEX buddy_requests_owner ON buddy_requests(user_id,workspace_key,position,id);
CREATE TABLE radar_signal_saves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  workspace_key text NOT NULL CHECK(length(workspace_key) BETWEEN 1 AND 240),
  client_key text NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  position int NOT NULL DEFAULT 0 CHECK(position>=0),
  ui_payload jsonb NOT NULL CHECK(octet_length(ui_payload::text)<=900000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,workspace_key,client_key), UNIQUE(id,user_id),
  signal_client_key text NOT NULL
);
CREATE INDEX radar_signal_saves_owner ON radar_signal_saves(user_id,workspace_key,position,id);
CREATE TABLE team_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  workspace_key text NOT NULL CHECK(length(workspace_key) BETWEEN 1 AND 240),
  client_key text NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  position int NOT NULL DEFAULT 0 CHECK(position>=0),
  ui_payload jsonb NOT NULL CHECK(octet_length(ui_payload::text)<=900000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,workspace_key,client_key), UNIQUE(id,user_id),
  title text NOT NULL, role text NOT NULL, schedule text NOT NULL, capacity int NOT NULL CHECK(capacity BETWEEN 2 AND 10), joined boolean NOT NULL, is_owner boolean NOT NULL
);
CREATE INDEX team_rooms_owner ON team_rooms(user_id,workspace_key,position,id);
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  workspace_key text NOT NULL CHECK(length(workspace_key) BETWEEN 1 AND 240),
  client_key text NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  position int NOT NULL DEFAULT 0 CHECK(position>=0),
  ui_payload jsonb NOT NULL CHECK(octet_length(ui_payload::text)<=900000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,workspace_key,client_key), UNIQUE(id,user_id),
  type text NOT NULL CHECK(type IN ('job_hit','interview_reminder','system','social')), title text NOT NULL, body text NOT NULL, target_path text, read_at timestamptz, dedup_key text NOT NULL, UNIQUE(user_id,dedup_key)
);
CREATE INDEX notifications_owner ON notifications(user_id,workspace_key,position,id);
CREATE TABLE company_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  workspace_key text NOT NULL CHECK(length(workspace_key) BETWEEN 1 AND 240),
  client_key text NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  position int NOT NULL DEFAULT 0 CHECK(position>=0),
  ui_payload jsonb NOT NULL CHECK(octet_length(ui_payload::text)<=900000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,workspace_key,client_key), UNIQUE(id,user_id),
  company_id uuid NOT NULL REFERENCES companies(id), title text NOT NULL, category text NOT NULL, role text NOT NULL, rating numeric NOT NULL CHECK(rating BETWEEN 1 AND 5), body text NOT NULL, hidden boolean NOT NULL
);
CREATE INDEX company_notes_owner ON company_notes(user_id,workspace_key,position,id);
CREATE TABLE company_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  workspace_key text NOT NULL CHECK(length(workspace_key) BETWEEN 1 AND 240),
  client_key text NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  position int NOT NULL DEFAULT 0 CHECK(position>=0),
  ui_payload jsonb NOT NULL CHECK(octet_length(ui_payload::text)<=900000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,workspace_key,client_key), UNIQUE(id,user_id),
  company_id uuid NOT NULL REFERENCES companies(id), title text NOT NULL, role text NOT NULL, result text NOT NULL, note text NOT NULL
);
CREATE INDEX company_results_owner ON company_results(user_id,workspace_key,position,id);
CREATE TABLE company_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  workspace_key text NOT NULL CHECK(length(workspace_key) BETWEEN 1 AND 240),
  client_key text NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  position int NOT NULL DEFAULT 0 CHECK(position>=0),
  ui_payload jsonb NOT NULL CHECK(octet_length(ui_payload::text)<=900000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,workspace_key,client_key), UNIQUE(id,user_id),
  company_id uuid NOT NULL REFERENCES companies(id), item_key text NOT NULL
);
CREATE INDEX company_checklists_owner ON company_checklists(user_id,workspace_key,position,id);
CREATE TABLE workspace_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  workspace_key text NOT NULL CHECK(length(workspace_key) BETWEEN 1 AND 240),
  client_key text NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  position int NOT NULL DEFAULT 0 CHECK(position>=0),
  ui_payload jsonb NOT NULL CHECK(octet_length(ui_payload::text)<=900000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,workspace_key,client_key), UNIQUE(id,user_id),
  value jsonb NOT NULL
);
CREATE INDEX workspace_settings_owner ON workspace_settings(user_id,workspace_key,position,id);
CREATE UNIQUE INDEX resumes_one_default ON resumes(user_id) WHERE is_default;
CREATE UNIQUE INDEX resumes_user_version ON resumes(user_id,version);
CREATE INDEX subscriptions_enabled ON subscriptions(user_id,enabled);
CREATE INDEX calendar_events_schedule ON calendar_events(user_id,scheduled_start);
CREATE INDEX plan_tasks_status ON plan_tasks(user_id,status,due_date);
CREATE INDEX salary_reports_dimensions ON salary_reports(company_id,role,city,year);
CREATE INDEX notifications_unread ON notifications(user_id,read_at,created_at);
CREATE TABLE resume_applications(resume_id uuid NOT NULL,user_id uuid NOT NULL,application_id uuid NOT NULL,PRIMARY KEY(resume_id,application_id),FOREIGN KEY(resume_id,user_id) REFERENCES resumes(id,user_id) ON DELETE CASCADE,FOREIGN KEY(application_id,user_id) REFERENCES applications(id,user_id));
CREATE TABLE subscription_hits(subscription_id uuid NOT NULL,user_id uuid NOT NULL,job_id uuid NOT NULL REFERENCES jobs(id),hit_date text NOT NULL,is_read boolean NOT NULL,PRIMARY KEY(subscription_id,job_id),FOREIGN KEY(subscription_id,user_id) REFERENCES subscriptions(id,user_id) ON DELETE CASCADE);
CREATE TABLE mock_answers(mock_session_id uuid NOT NULL,user_id uuid NOT NULL,sequence int NOT NULL,question_key text NOT NULL,question_snapshot jsonb NOT NULL,answer_text text NOT NULL,feedback jsonb,PRIMARY KEY(mock_session_id,sequence),FOREIGN KEY(mock_session_id,user_id) REFERENCES mock_sessions(id,user_id) ON DELETE CASCADE);
CREATE TABLE collection_questions(collection_id uuid NOT NULL,user_id uuid NOT NULL,question_key text NOT NULL,position int NOT NULL,PRIMARY KEY(collection_id,question_key),FOREIGN KEY(collection_id,user_id) REFERENCES practice_collections(id,user_id) ON DELETE CASCADE);
CREATE TABLE room_questions(room_id uuid NOT NULL,user_id uuid NOT NULL,question_key text NOT NULL,position int NOT NULL,PRIMARY KEY(room_id,question_key),FOREIGN KEY(room_id,user_id) REFERENCES team_rooms(id,user_id) ON DELETE CASCADE);
CREATE TABLE room_notes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),room_id uuid NOT NULL,user_id uuid NOT NULL,client_key text NOT NULL,body text NOT NULL,position int NOT NULL,UNIQUE(room_id,client_key),FOREIGN KEY(room_id,user_id) REFERENCES team_rooms(id,user_id) ON DELETE CASCADE);
CREATE TABLE team_members(room_id uuid NOT NULL,user_id uuid NOT NULL,role text NOT NULL CHECK(role IN ('owner','member')),PRIMARY KEY(room_id,user_id),FOREIGN KEY(room_id,user_id) REFERENCES team_rooms(id,user_id) ON DELETE CASCADE);
CREATE TABLE private_files(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),client_key text NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),storage_key text NOT NULL UNIQUE CHECK(storage_key ~ '^[a-f0-9]{64}$'),name text NOT NULL CHECK(length(name) BETWEEN 1 AND 300),mime_type text NOT NULL,size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 31457280),file_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,client_key));
CREATE INDEX private_files_owner ON private_files(user_id,updated_at,id);
ALTER TABLE resumes ADD COLUMN file_id uuid REFERENCES private_files(id) ON DELETE SET NULL, ADD COLUMN file_hash text, ADD COLUMN content_hash text NOT NULL DEFAULT '', ADD COLUMN parse_status text NOT NULL DEFAULT 'succeeded' CHECK(parse_status IN ('queued','running','succeeded','failed','cancelled'));

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['workspace_revisions','resumes','subscriptions','referral_requests','calendar_events','plan_milestones','plan_tasks','plan_reminders','offers','offer_comparisons','salary_reports','interview_rounds','interview_reviews','mock_sessions','experience_drafts','question_progress','practice_collections','question_answers','experience_comments','experience_summaries','experience_reactions','handbook_notes','handbook_templates','posts','content_reports','buddy_requests','radar_signal_saves','team_rooms','notifications','company_notes','company_results','company_checklists','workspace_settings','resume_applications','subscription_hits','mock_answers','collection_questions','room_questions','room_notes','team_members','private_files'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY %I ON %I TO campus_web USING(user_id=app.current_user_id()) WITH CHECK(user_id=app.current_user_id())',t||'_self',t);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO campus_web',t);
 END LOOP;
END $$;
COMMIT;
