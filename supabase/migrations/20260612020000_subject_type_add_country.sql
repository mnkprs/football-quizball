-- subject_type CHECK was missing 'country' — classifier returns it for
-- questions like "In which country is stadium X located?" but the DB rejected
-- the insert. Add it. The pre-existing 'match'/'rule'/'transfer' values remain
-- for future use.

ALTER TABLE question_pool DROP CONSTRAINT question_pool_subject_type_check;
ALTER TABLE question_pool ADD CONSTRAINT question_pool_subject_type_check
  CHECK (subject_type IS NULL OR subject_type IN
    ('player','team','league','trophy','match','manager','stadium','rule','transfer','country'));
