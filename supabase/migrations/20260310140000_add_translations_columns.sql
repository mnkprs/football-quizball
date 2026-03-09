-- Add translations jsonb column to question_pool and blitz_question_pool.
-- Structure: { "el": { "question_text": "...", "explanation": "..." } } for question_pool
--            { "el": { "question_text": "..." } } for blitz_question_pool
-- correct_answer and wrong_choices stay in English per product decision.

ALTER TABLE question_pool
  ADD COLUMN IF NOT EXISTS translations jsonb DEFAULT '{}'::jsonb;

ALTER TABLE blitz_question_pool
  ADD COLUMN IF NOT EXISTS translations jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN question_pool.translations IS 'Per-language translations. Keys: el, etc. Values: { question_text, explanation }';
COMMENT ON COLUMN blitz_question_pool.translations IS 'Per-language translations. Keys: el, etc. Values: { question_text }';
