-- Extend the existing private favorite resource to published question records.
BEGIN;
ALTER TABLE favorites
  ADD COLUMN question_id uuid REFERENCES questions(id),
  DROP CONSTRAINT favorites_target_type_check,
  DROP CONSTRAINT favorites_check,
  DROP CONSTRAINT favorites_check1;
ALTER TABLE favorites
  ADD CONSTRAINT favorites_target_type_check CHECK(target_type IN ('job','experience','company','question')),
  ADD CONSTRAINT favorites_single_target CHECK(num_nonnulls(job_id,experience_id,company_id,question_id)=1),
  ADD CONSTRAINT favorites_matching_target CHECK(
    (target_type='job' AND job_id IS NOT NULL) OR
    (target_type='experience' AND experience_id IS NOT NULL) OR
    (target_type='company' AND company_id IS NOT NULL) OR
    (target_type='question' AND question_id IS NOT NULL)
  );
CREATE UNIQUE INDEX favorites_question ON favorites(user_id,question_id) WHERE question_id IS NOT NULL;
COMMIT;
