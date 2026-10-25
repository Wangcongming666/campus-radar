-- Apply after 0003 using the trusted BYPASSRLS migration owner, never the web login.
-- Local identities are separate from user profile DTOs and Supabase credentials.
BEGIN;
CREATE TABLE app.local_identities (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE CHECK (
    email=lower(btrim(email)) AND length(email) BETWEEN 3 AND 254
    AND position('@' IN email)>1 AND email !~ '[[:space:]]'
  ),
  password_hash text NOT NULL CHECK (
    password_hash ~ '^scrypt\$32768\$8\$3\$[a-f0-9]{64}\$[a-f0-9]{128}$'
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app.local_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.local_identities FORCE ROW LEVEL SECURITY;
REVOKE ALL ON app.local_identities FROM PUBLIC, campus_web, campus_worker, campus_scheduler;

-- Registration creates both records atomically. A duplicate email rolls back
-- the tentative profile and returns NULL; it cannot replace an existing hash.
CREATE FUNCTION app.register_local_identity(p_email text,p_display_name text,p_password_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE new_user_id uuid := gen_random_uuid();
BEGIN
  IF p_email IS NULL OR p_display_name IS NULL OR p_password_hash IS NULL
     OR length(btrim(p_display_name)) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'Invalid identity input' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.users(id,display_name) VALUES(new_user_id,btrim(p_display_name));
  INSERT INTO app.local_identities(user_id,email,password_hash)
    VALUES(new_user_id,lower(btrim(p_email)),p_password_hash);
  RETURN new_user_id;
EXCEPTION WHEN unique_violation THEN
  RETURN NULL;
END $$;

-- Password verification happens in the trusted BFF using Node scrypt. Only this
-- single-account lookup is granted; callers cannot scan the identity table.
CREATE FUNCTION app.find_local_identity(p_email text)
RETURNS TABLE(user_id uuid,email text,password_hash text,display_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT i.user_id,i.email,i.password_hash,u.display_name
  FROM app.local_identities i JOIN public.users u ON u.id=i.user_id
  WHERE i.email=lower(btrim(p_email)) AND u.status='active'
$$;
REVOKE ALL ON FUNCTION app.register_local_identity(text,text,text),app.find_local_identity(text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.register_local_identity(text,text,text),app.find_local_identity(text)
  TO campus_web;
COMMIT;
