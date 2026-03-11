-- Create question_pool_legacy table for archiving pre-formula questions.
-- These are questions generated before the DifficultyScorer/raw_score pipeline.
-- Use migrate_legacy_questions_to_archive.sql to move them.

CREATE TABLE IF NOT EXISTS question_pool_legacy (
  id               uuid        PRIMARY KEY,
  category         text        NOT NULL,
  difficulty       text        NOT NULL,
  question         jsonb       NOT NULL,
  used             boolean     DEFAULT false NOT NULL,
  translations     jsonb       DEFAULT '{}'::jsonb,
  created_at       timestamptz,
  raw_score        double precision,
  migrated_at      timestamptz  DEFAULT now() NOT NULL
);

COMMENT ON TABLE question_pool_legacy IS 'Archive of questions generated before the difficulty formula change. Excluded from main pool for analysis.';

CREATE INDEX IF NOT EXISTS idx_qpl_category_difficulty ON question_pool_legacy (category, difficulty);
CREATE INDEX IF NOT EXISTS idx_qpl_migrated_at ON question_pool_legacy (migrated_at);

ALTER TABLE question_pool_legacy ENABLE ROW LEVEL SECURITY;
