-- Real catalog entry and private application metadata. No sample rows.
BEGIN;
ALTER TABLE applications ADD COLUMN resume_id uuid REFERENCES resumes(id) ON DELETE SET NULL, ADD COLUMN display_date text NOT NULL DEFAULT '', ADD COLUMN deleted_at timestamptz;
ALTER TABLE jobs ALTER COLUMN verified_at DROP NOT NULL;
ALTER TABLE companies ADD COLUMN recorded_by uuid REFERENCES users(id);
ALTER TABLE sources ADD COLUMN recorded_by uuid REFERENCES users(id), ADD COLUMN entry_mode text NOT NULL DEFAULT 'official' CHECK(entry_mode IN ('official','manual'));
ALTER TABLE jobs ADD COLUMN recorded_by uuid REFERENCES users(id);
CREATE POLICY companies_manual_insert ON companies FOR INSERT TO campus_web WITH CHECK(recorded_by=app.current_user_id() AND verified_at IS NULL);
CREATE POLICY jobs_manual_insert ON jobs FOR INSERT TO campus_web WITH CHECK(recorded_by=app.current_user_id() AND verified_at IS NULL AND EXISTS(SELECT 1 FROM sources s WHERE s.id=source_id AND s.recorded_by=app.current_user_id() AND s.entry_mode='manual' AND NOT s.enabled AND s.permission_status='pending'));
CREATE POLICY sources_manual_insert ON sources FOR INSERT TO campus_web WITH CHECK(recorded_by=app.current_user_id() AND entry_mode='manual' AND NOT enabled AND permission_status='pending' AND robots_checked_at IS NULL);
CREATE POLICY sources_manual_summary ON sources FOR SELECT TO campus_web USING(entry_mode='manual');
GRANT INSERT ON companies,sources,jobs TO campus_web;
GRANT SELECT(recorded_by,entry_mode,enabled,permission_status) ON sources TO campus_web;
CREATE TABLE questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL CHECK(length(title) BETWEEN 1 AND 500),
  topic text NOT NULL CHECK(length(topic) BETWEEN 1 AND 100), difficulty text NOT NULL CHECK(difficulty IN ('简单','中等','困难')),
  frequency int NOT NULL DEFAULT 0 CHECK(frequency BETWEEN 0 AND 100), answer text NOT NULL,
  company_ids uuid[] NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions FORCE ROW LEVEL SECURITY;
CREATE POLICY questions_public ON questions FOR SELECT TO campus_web USING(status='published');
GRANT SELECT ON questions TO campus_web;
CREATE INDEX applications_alive ON applications(user_id,stage,sort_key,id) WHERE deleted_at IS NULL;
COMMIT;
