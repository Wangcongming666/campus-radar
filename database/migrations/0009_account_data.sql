-- Apply as the trusted migration owner. No sample rows or account identities are changed.
BEGIN;
CREATE FUNCTION app.reset_private_workspace() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE owner_id uuid := app.current_user_id(); resource text;
BEGIN
  IF owner_id IS NULL THEN RAISE EXCEPTION 'Authenticated user required' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(owner_id::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('workspace:'||owner_id::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('files:'||owner_id::text,0));
  PERFORM 1 FROM public.users WHERE id=owner_id AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
  -- Every predicate is bound to app.current_user_id(); no target id is accepted.
  FOREACH resource IN ARRAY ARRAY[
    'resume_applications','subscription_hits','mock_answers','collection_questions',
    'room_questions','room_notes','team_members','interview_reviews','interview_rounds',
    'calendar_events','offers','resumes','subscriptions','referral_requests',
    'plan_tasks','plan_reminders','plan_milestones','offer_comparisons','salary_reports',
    'mock_sessions','experience_drafts','question_progress','practice_collections',
    'question_answers','experience_comments','experience_summaries','experience_reactions',
    'handbook_notes','handbook_templates','posts','content_reports','buddy_requests',
    'radar_signal_saves','team_rooms','notifications','company_notes','company_results',
    'company_checklists','workspace_settings','private_files','workspace_revisions',
    'chapter_progress','favorites'
  ] LOOP
    EXECUTE format('DELETE FROM public.%I WHERE user_id=$1',resource) USING owner_id;
  END LOOP;
  DELETE FROM public.application_stage_events e USING public.applications a
    WHERE e.application_id=a.id AND a.user_id=owner_id;
  DELETE FROM public.applications WHERE user_id=owner_id;
  DELETE FROM public.idempotency_records WHERE actor_id=owner_id;
  -- Identity, profile, login sessions, job catalog, public original experiences
  -- and background task receipts are deliberately retained.
END $$;
REVOKE ALL ON FUNCTION app.reset_private_workspace() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reset_private_workspace() TO campus_web;
COMMIT;
