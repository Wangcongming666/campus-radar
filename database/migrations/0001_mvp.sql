-- Run once with a migration owner on a fresh PostgreSQL 16+ database.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='campus_web') THEN CREATE ROLE campus_web NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='campus_worker') THEN CREATE ROLE campus_worker NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='campus_scheduler') THEN CREATE ROLE campus_scheduler NOLOGIN; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS app;
CREATE FUNCTION app.current_user_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA app, public TO campus_web, campus_worker, campus_scheduler;
GRANT EXECUTE ON FUNCTION app.current_user_id() TO campus_web;

CREATE TYPE application_stage AS ENUM ('PENDING','APPLIED','ASSESSMENT','INTERVIEW_1','INTERVIEW_2','HR','OFFER','CLOSED');
CREATE TYPE education AS ENUM ('any','associate','bachelor','master','doctorate');
CREATE TYPE recruitment_type AS ENUM ('campus','internship');
CREATE TYPE deadline_precision AS ENUM ('exact','date','unknown');
CREATE TYPE task_state AS ENUM ('queued','running','succeeded','failed','cancelled');
CREATE TYPE task_type AS ENUM ('CRAWL_JOBS','DATA_EXPORT','USER_ERASURE');
CREATE TYPE closed_reason AS ENUM ('rejected','withdrawn','expired','accepted','other');
CREATE TYPE permission_status AS ENUM ('pending','approved','paused');

CREATE TABLE users (
  id uuid PRIMARY KEY, display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
  avatar_url text, graduation_year int CHECK (graduation_year BETWEEN 2000 AND 2100),
  education education, school text, onboarding_step int NOT NULL DEFAULT 0 CHECK (onboarding_step BETWEEN 0 AND 4),
  preferences jsonb NOT NULL DEFAULT '{"schemaVersion":1,"roles":[],"cities":[],"industries":[],"recruitmentTypes":[],"graduationYear":null}',
  theme text NOT NULL DEFAULT 'system' CHECK (theme IN ('dark','light','system')),
  timezone text NOT NULL DEFAULT 'Asia/Shanghai', status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleting','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL UNIQUE, name text NOT NULL,
  logo_url text, industry text, size_band text, locations text[] NOT NULL DEFAULT '{}', tags text[] NOT NULL DEFAULT '{}',
  description text NOT NULL DEFAULT '', verified_at timestamptz,
  intelligence jsonb NOT NULL DEFAULT '{"schemaVersion":1,"styleWeights":[],"sources":[],"releaseTimeline":[],"updatedAt":null}',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX companies_tags ON companies USING gin(tags);
CREATE TABLE sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, base_url text NOT NULL,
  allowed_hosts text[] NOT NULL CHECK (cardinality(allowed_hosts)>0), company_id uuid REFERENCES companies(id),
  robots_checked_at timestamptz, permission_status permission_status NOT NULL DEFAULT 'pending',
  terms_note text NOT NULL DEFAULT '', allowed_content_mode text NOT NULL DEFAULT 'excerpt_link'
    CHECK (allowed_content_mode IN ('licensed_full','user_original','excerpt_link')),
  rate_policy jsonb NOT NULL DEFAULT '{"schemaVersion":1,"delaySeconds":6,"concurrency":1}',
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT enabled OR (permission_status='approved' AND company_id IS NOT NULL AND robots_checked_at IS NOT NULL AND length(trim(terms_note))>0))
);
CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id),
  source_id uuid NOT NULL REFERENCES sources(id), source_external_id text, canonical_url text NOT NULL,
  title text NOT NULL, role text NOT NULL, cities text[] NOT NULL DEFAULT '{}', education education NOT NULL DEFAULT 'any',
  recruitment_type recruitment_type NOT NULL, graduation_years int[] NOT NULL DEFAULT '{}', skills text[] NOT NULL DEFAULT '{}',
  description_md text NOT NULL, salary jsonb, deadline_at timestamptz, deadline_precision deadline_precision NOT NULL DEFAULT 'unknown',
  source_timezone text NOT NULL DEFAULT 'Asia/Shanghai', published_at timestamptz NOT NULL, last_seen_at timestamptz NOT NULL,
  verified_at timestamptz NOT NULL, status text NOT NULL CHECK (status IN ('open','closed','unknown')), content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_id,canonical_url), UNIQUE(source_id,source_external_id),
  CHECK ((deadline_precision='unknown') = (deadline_at IS NULL))
);
CREATE INDEX jobs_newest ON jobs(status,published_at DESC,id DESC);
CREATE INDEX jobs_deadline ON jobs(deadline_at,id);
CREATE INDEX jobs_company ON jobs(company_id);
CREATE INDEX jobs_cities ON jobs USING gin(cities);
CREATE INDEX jobs_skills ON jobs USING gin(skills);
CREATE INDEX jobs_title_trgm ON jobs USING gin(title gin_trgm_ops);
CREATE TABLE applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), job_id uuid NOT NULL REFERENCES jobs(id),
  stage application_stage NOT NULL DEFAULT 'PENDING', sort_key numeric NOT NULL DEFAULT 1024,
  version int NOT NULL DEFAULT 1 CHECK(version>0), notes text NOT NULL DEFAULT '', applied_at timestamptz,
  closed_at timestamptz, closed_reason closed_reason, archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,job_id), CHECK ((stage='CLOSED') = (closed_at IS NOT NULL AND closed_reason IS NOT NULL)),
  CHECK (stage='CLOSED' OR (closed_at IS NULL AND closed_reason IS NULL))
);
CREATE INDEX applications_board ON applications(user_id,stage,sort_key,id) WHERE archived_at IS NULL;
CREATE TABLE application_stage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), application_id uuid NOT NULL REFERENCES applications(id),
  from_stage application_stage, to_stage application_stage NOT NULL, old_sort_key numeric, new_sort_key numeric NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id), occurred_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL CHECK(version>0), operation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid()
);
CREATE INDEX application_events ON application_stage_events(application_id,occurred_at DESC);
CREATE TABLE experiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid REFERENCES companies(id), author_id uuid REFERENCES users(id),
  source_id uuid REFERENCES sources(id), source_url text, title text NOT NULL, summary text NOT NULL, body_md text,
  role text NOT NULL, round_type text NOT NULL CHECK(round_type IN ('assessment','technical','business','hr','final','other')),
  occurred_at date, tags text[] NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending','published','rejected')),
  content_mode text NOT NULL CHECK(content_mode IN ('licensed_full','user_original','excerpt_link')), license_note text NOT NULL,
  published_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(author_id IS NOT NULL OR source_id IS NOT NULL), CHECK(status!='published' OR published_at IS NOT NULL)
);
CREATE INDEX experiences_public ON experiences(company_id,role,published_at DESC,id DESC) WHERE status='published';
CREATE TABLE handbook_chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), parent_id uuid REFERENCES handbook_chapters(id), slug text NOT NULL UNIQUE,
  title text NOT NULL, direction text NOT NULL, sort_order int NOT NULL DEFAULT 0, body_md text NOT NULL,
  content_version int NOT NULL DEFAULT 1 CHECK(content_version>0), status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CHECK(parent_id IS DISTINCT FROM id)
);
CREATE INDEX handbook_order ON handbook_chapters(direction,parent_id,sort_order);
CREATE FUNCTION app.check_chapter_cycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Serialize tree edits to avoid concurrent A→B / B→A writes.
  PERFORM pg_advisory_xact_lock(17456201);
  IF EXISTS (WITH RECURSIVE ancestors AS (
    SELECT id,parent_id FROM handbook_chapters WHERE id=NEW.parent_id
    UNION SELECT h.id,h.parent_id FROM handbook_chapters h JOIN ancestors a ON h.id=a.parent_id
  ) SELECT FROM ancestors WHERE id=NEW.id) THEN RAISE EXCEPTION 'Chapter cycle' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER handbook_no_cycle BEFORE INSERT OR UPDATE OF parent_id ON handbook_chapters FOR EACH ROW EXECUTE FUNCTION app.check_chapter_cycle();
CREATE TABLE chapter_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), chapter_id uuid NOT NULL REFERENCES handbook_chapters(id),
  completed boolean NOT NULL DEFAULT false, note text NOT NULL DEFAULT '', chapter_version int NOT NULL CHECK(chapter_version>0),
  version int NOT NULL DEFAULT 1 CHECK(version>0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,chapter_id)
);
CREATE TABLE favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
  target_type text NOT NULL CHECK(target_type IN ('job','experience','company')),
  job_id uuid REFERENCES jobs(id), experience_id uuid REFERENCES experiences(id), company_id uuid REFERENCES companies(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(num_nonnulls(job_id,experience_id,company_id)=1),
  CHECK((target_type='job' AND job_id IS NOT NULL) OR (target_type='experience' AND experience_id IS NOT NULL) OR (target_type='company' AND company_id IS NOT NULL))
);
CREATE UNIQUE INDEX favorites_job ON favorites(user_id,job_id) WHERE job_id IS NOT NULL;
CREATE UNIQUE INDEX favorites_experience ON favorites(user_id,experience_id) WHERE experience_id IS NOT NULL;
CREATE UNIQUE INDEX favorites_company ON favorites(user_id,company_id) WHERE company_id IS NOT NULL;
CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), token_hash text NOT NULL UNIQUE,
  encrypted_provider_credentials bytea NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users(id), type task_type NOT NULL,
  state task_state NOT NULL DEFAULT 'queued', payload jsonb NOT NULL CHECK(payload->>'schemaVersion'='1'),
  result_ref jsonb, dedup_key text NOT NULL UNIQUE CHECK(length(dedup_key) BETWEEN 1 AND 200),
  attempt int NOT NULL DEFAULT 0 CHECK(attempt>=0), max_attempts int NOT NULL DEFAULT 3 CHECK(max_attempts BETWEEN 1 AND 10),
  available_at timestamptz NOT NULL DEFAULT now(), lease_owner text, lease_until timestamptz, lease_token uuid,
  progress int NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100), error_code text, expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK((state='running') = (lease_owner IS NOT NULL AND lease_until IS NOT NULL AND lease_token IS NOT NULL)),
  CHECK(state='running' OR (lease_owner IS NULL AND lease_until IS NULL AND lease_token IS NULL)),
  CHECK(type='CRAWL_JOBS' OR user_id IS NOT NULL)
);
CREATE INDEX tasks_claim ON tasks(available_at,created_at,id) WHERE state='queued';
CREATE INDEX tasks_expired_lease ON tasks(lease_until) WHERE state='running';
CREATE TABLE crawl_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id uuid NOT NULL REFERENCES sources(id), task_id uuid NOT NULL REFERENCES tasks(id),
  started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz, status task_state NOT NULL DEFAULT 'running',
  counts jsonb NOT NULL DEFAULT '{"schemaVersion":1,"changed":0,"skipped":0,"failed":0}', error_code text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE crawl_batches (
  run_id uuid NOT NULL REFERENCES crawl_runs(id), batch_id uuid NOT NULL, body_hash text NOT NULL,
  result jsonb NOT NULL, final boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(run_id,batch_id)
);
CREATE TABLE worker_nonces (key_id text NOT NULL, nonce text NOT NULL, expires_at timestamptz NOT NULL, PRIMARY KEY(key_id,nonce));
CREATE INDEX worker_nonces_expiry ON worker_nonces(expires_at);
CREATE TABLE scheduled_sources (
  source_id uuid PRIMARY KEY REFERENCES sources(id), interval_seconds int NOT NULL DEFAULT 21600 CHECK(interval_seconds>=300),
  next_run_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE idempotency_records (
  actor_id uuid NOT NULL REFERENCES users(id), route text NOT NULL, key text NOT NULL, request_hash text NOT NULL,
  status int NOT NULL CHECK(status BETWEEN 100 AND 599), response jsonb NOT NULL, expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(actor_id,route,key)
);

-- Never grant runtime roles table ownership, BYPASSRLS, or broad private-table access.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['users','companies','sources','jobs','applications','application_stage_events','experiences','handbook_chapters','chapter_progress','favorites','auth_sessions','tasks','crawl_runs','crawl_batches','worker_nonces','scheduled_sources','idempotency_records'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
CREATE POLICY users_self ON users TO campus_web USING(id=app.current_user_id()) WITH CHECK(id=app.current_user_id());
CREATE POLICY companies_public ON companies FOR SELECT TO campus_web USING(true);
CREATE POLICY jobs_public ON jobs FOR SELECT TO campus_web USING(true);
CREATE POLICY experiences_public ON experiences FOR SELECT TO campus_web USING(status='published' OR author_id=app.current_user_id());
CREATE POLICY handbook_public ON handbook_chapters FOR SELECT TO campus_web USING(status='published');
CREATE POLICY applications_self ON applications TO campus_web USING(user_id=app.current_user_id()) WITH CHECK(user_id=app.current_user_id());
CREATE POLICY progress_self ON chapter_progress TO campus_web USING(user_id=app.current_user_id()) WITH CHECK(user_id=app.current_user_id());
CREATE POLICY favorites_self ON favorites TO campus_web USING(user_id=app.current_user_id()) WITH CHECK(user_id=app.current_user_id());
CREATE POLICY events_self ON application_stage_events TO campus_web USING(EXISTS(SELECT FROM applications a WHERE a.id=application_id AND a.user_id=app.current_user_id()))
  WITH CHECK(actor_id=app.current_user_id() AND EXISTS(SELECT FROM applications a WHERE a.id=application_id AND a.user_id=app.current_user_id()));
CREATE POLICY tasks_self_read ON tasks FOR SELECT TO campus_web USING(user_id=app.current_user_id());
CREATE POLICY tasks_self_insert ON tasks FOR INSERT TO campus_web WITH CHECK(user_id=app.current_user_id() AND type IN ('DATA_EXPORT','USER_ERASURE') AND state='queued' AND attempt=0);
CREATE POLICY idempotency_self ON idempotency_records TO campus_web USING(actor_id=app.current_user_id()) WITH CHECK(actor_id=app.current_user_id());
CREATE POLICY tasks_worker ON tasks TO campus_worker USING(true) WITH CHECK(true);
CREATE POLICY tasks_scheduler_insert ON tasks FOR INSERT TO campus_scheduler WITH CHECK(type='CRAWL_JOBS' AND user_id IS NULL AND state='queued');
CREATE POLICY tasks_scheduler_read ON tasks FOR SELECT TO campus_scheduler USING(type='CRAWL_JOBS' AND user_id IS NULL);
CREATE POLICY sources_worker ON sources FOR SELECT TO campus_worker USING(true);
CREATE POLICY sources_scheduler ON sources FOR SELECT TO campus_scheduler USING(enabled AND permission_status='approved');
CREATE POLICY runs_worker ON crawl_runs TO campus_worker USING(true) WITH CHECK(true);
CREATE POLICY schedule_scheduler ON scheduled_sources TO campus_scheduler USING(true) WITH CHECK(true);
CREATE POLICY nonces_worker ON worker_nonces TO campus_worker USING(true) WITH CHECK(true);
GRANT SELECT ON companies,jobs,experiences,handbook_chapters TO campus_web;
GRANT SELECT,UPDATE ON users TO campus_web;
GRANT SELECT,INSERT,UPDATE ON applications,chapter_progress,favorites TO campus_web;
GRANT DELETE ON favorites TO campus_web;
GRANT SELECT,INSERT ON application_stage_events,tasks TO campus_web;
GRANT SELECT,INSERT,UPDATE,DELETE ON idempotency_records TO campus_web;
GRANT SELECT,INSERT,UPDATE ON tasks,crawl_runs TO campus_worker;
GRANT SELECT ON sources TO campus_worker;
GRANT SELECT,INSERT,DELETE ON worker_nonces TO campus_worker;
GRANT SELECT,INSERT ON tasks TO campus_scheduler;
GRANT SELECT ON sources TO campus_scheduler;
GRANT SELECT,UPDATE ON scheduled_sources TO campus_scheduler;
-- auth_sessions and crawl_batches deliberately have no runtime grants yet: BFF
-- session encryption and web batch ingestion must be implemented before enabling.
COMMIT;
