-- Preserve date-only official publications without inventing a time of day.
BEGIN;
ALTER TABLE jobs
  ALTER COLUMN published_at DROP NOT NULL,
  ALTER COLUMN education DROP NOT NULL,
  ADD COLUMN published_date date,
  ADD COLUMN published_precision text NOT NULL DEFAULT 'exact'
    CHECK (published_precision IN ('exact','date','unknown')),
  ADD COLUMN provenance jsonb NOT NULL DEFAULT '{"schemaVersion":1}'::jsonb;

UPDATE jobs SET published_date=(published_at AT TIME ZONE source_timezone)::date,
  published_precision='exact' WHERE published_at IS NOT NULL;

ALTER TABLE jobs ADD CONSTRAINT jobs_publication_precision CHECK (
  (published_precision='exact' AND published_at IS NOT NULL AND published_date IS NOT NULL)
  OR (published_precision='date' AND published_at IS NULL AND published_date IS NOT NULL)
  OR (published_precision='unknown' AND published_at IS NULL AND published_date IS NULL)
);

-- Existing signed/manual writers supply an exact timestamp. Retain compatibility
-- while deriving only its calendar date in the source's declared time zone.
CREATE FUNCTION app.job_publication_date() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.published_precision='exact' AND NEW.published_at IS NOT NULL THEN
    NEW.published_date := (NEW.published_at AT TIME ZONE NEW.source_timezone)::date;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER jobs_publication_date BEFORE INSERT OR UPDATE OF published_at,published_date,published_precision,source_timezone
  ON jobs FOR EACH ROW EXECUTE FUNCTION app.job_publication_date();
REVOKE ALL ON FUNCTION app.job_publication_date() FROM PUBLIC;

-- Only an internal ordering key: never returned as published_at for a date row.
CREATE INDEX jobs_publication_order ON jobs
  ((coalesce(published_at,published_date::timestamp AT TIME ZONE 'UTC')) DESC NULLS LAST,id DESC);

ALTER TABLE sources DROP CONSTRAINT sources_allowed_content_mode_check;
ALTER TABLE sources ADD CONSTRAINT sources_allowed_content_mode_check
  CHECK (allowed_content_mode IN ('licensed_full','user_original','excerpt_link','metadata_only'));
COMMIT;
