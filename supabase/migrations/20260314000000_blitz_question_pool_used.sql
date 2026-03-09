-- Add used column to blitz_question_pool.
-- When draw_blitz_questions_v2 draws questions, they are marked used=true.
-- Seeding checks unanswered (used=false) count.

ALTER TABLE blitz_question_pool
  ADD COLUMN IF NOT EXISTS used boolean DEFAULT false NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bqp_used ON blitz_question_pool (used) WHERE used = false;
