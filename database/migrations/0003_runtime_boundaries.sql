-- Apply after 0001; optional 0002 is independent. Migration owner only.
BEGIN;
ALTER TABLE application_stage_events ADD COLUMN old_closed_reason closed_reason,
  ADD COLUMN old_closed_at timestamptz, ADD COLUMN undo_of_operation_id uuid REFERENCES application_stage_events(operation_id);
CREATE UNIQUE INDEX one_undo_per_operation ON application_stage_events(undo_of_operation_id) WHERE undo_of_operation_id IS NOT NULL;

CREATE POLICY companies_worker ON companies FOR SELECT TO campus_worker USING(true);
CREATE POLICY jobs_worker ON jobs TO campus_worker USING(true) WITH CHECK(true);
CREATE POLICY batches_worker ON crawl_batches TO campus_worker USING(true) WITH CHECK(true);
CREATE POLICY sources_worker_pause ON sources FOR UPDATE TO campus_worker USING(true)
  WITH CHECK(NOT enabled AND permission_status='paused');
GRANT SELECT ON companies,jobs,crawl_batches TO campus_worker;
GRANT INSERT,UPDATE ON jobs TO campus_worker;
GRANT INSERT ON crawl_batches TO campus_worker;
GRANT UPDATE(enabled,permission_status,updated_at) ON sources TO campus_worker;
CREATE POLICY sources_public_summary ON sources FOR SELECT TO campus_web USING(permission_status='approved');
GRANT SELECT(id,name,base_url) ON sources TO campus_web;

-- BFF bootstrap cannot set user RLS context until a session is resolved. These
-- narrow operations are the only privileged authentication escape hatch. The
-- migration owner must be a trusted BYPASSRLS migration role (local postgres).
CREATE FUNCTION app.resolve_session(p_hash text)
RETURNS TABLE(id uuid,user_id uuid,encrypted_provider_credentials bytea,expires_at timestamptz,
              created_at timestamptz,display_name text,status text)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT s.id,s.user_id,s.encrypted_provider_credentials,s.expires_at,s.created_at,u.display_name,u.status
  FROM public.auth_sessions s JOIN public.users u ON u.id=s.user_id
  WHERE s.token_hash=p_hash AND s.revoked_at IS NULL AND s.expires_at>now() AND u.status='active'
$$;
CREATE FUNCTION app.create_auth_session(p_user_id uuid,p_display_name text,p_credentials bytea,p_hash text,p_expiry timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE session_id uuid;
BEGIN
  IF length(p_hash)<32 OR p_expiry<=now() OR p_expiry>now()+interval '8 days' OR octet_length(p_credentials)<16 THEN
    RAISE EXCEPTION 'Invalid session input' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.users(id,display_name) VALUES(p_user_id,p_display_name) ON CONFLICT(id) DO NOTHING;
  -- Serialize freezing and session creation for this account.
  PERFORM 1 FROM public.users WHERE id=p_user_id AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not active' USING ERRCODE='42501'; END IF;
  INSERT INTO public.auth_sessions(user_id,token_hash,encrypted_provider_credentials,expires_at)
  VALUES(p_user_id,p_hash,p_credentials,p_expiry) RETURNING id INTO session_id;
  RETURN session_id;
END $$;
CREATE FUNCTION app.revoke_session(p_hash text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  UPDATE public.auth_sessions SET revoked_at=now(),updated_at=now() WHERE token_hash=p_hash AND revoked_at IS NULL
$$;
CREATE FUNCTION app.freeze_user(p_user_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF p_user_id IS DISTINCT FROM app.current_user_id() THEN RAISE EXCEPTION 'Wrong user' USING ERRCODE='42501'; END IF;
  UPDATE public.users SET status='deleting',updated_at=now() WHERE id=p_user_id;
  UPDATE public.auth_sessions SET revoked_at=now(),updated_at=now() WHERE user_id=p_user_id AND revoked_at IS NULL;
  UPDATE public.tasks SET state='cancelled',lease_token=NULL,lease_until=NULL,lease_owner=NULL,error_code='USER_DELETING',updated_at=now()
    WHERE user_id=p_user_id AND state IN ('queued','running') AND type!='USER_ERASURE';
END $$;
REVOKE ALL ON FUNCTION app.resolve_session(text),app.create_auth_session(uuid,text,bytea,text,timestamptz),app.revoke_session(text),app.freeze_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_session(text),app.create_auth_session(uuid,text,bytea,text,timestamptz),app.revoke_session(text),app.freeze_user(uuid) TO campus_web;
-- Private fixed-window counters; callers supply hashed, non-sensitive buckets.
CREATE TABLE app.rate_limit_buckets(bucket text NOT NULL,window_start bigint NOT NULL,count int NOT NULL,
  expires_at timestamptz NOT NULL,PRIMARY KEY(bucket,window_start));
CREATE INDEX rate_limit_expiry ON app.rate_limit_buckets(expires_at);
CREATE FUNCTION app.consume_rate_limit(p_bucket text,p_max_count int,p_window_seconds int) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE bucket_start bigint; hits int;
BEGIN
  IF length(p_bucket) NOT BETWEEN 1 AND 200 OR p_max_count NOT BETWEEN 1 AND 1000 OR p_window_seconds NOT BETWEEN 1 AND 86400 THEN
    RAISE EXCEPTION 'Invalid rate limit input' USING ERRCODE='22023';
  END IF;
  bucket_start := floor(extract(epoch FROM now())/p_window_seconds)::bigint*p_window_seconds;
  DELETE FROM app.rate_limit_buckets WHERE expires_at<now();
  INSERT INTO app.rate_limit_buckets(bucket,window_start,count,expires_at)
    VALUES(p_bucket,bucket_start,1,to_timestamp(bucket_start+p_window_seconds))
    ON CONFLICT(bucket,window_start) DO UPDATE SET count=least(app.rate_limit_buckets.count+1,p_max_count+1)
    RETURNING count INTO hits;
  RETURN hits<=p_max_count;
END $$;
REVOKE ALL ON FUNCTION app.consume_rate_limit(text,int,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.consume_rate_limit(text,int,int) TO campus_web;
COMMIT;
