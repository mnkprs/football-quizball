-- Structured taxonomy columns on question_pool for future mode/concept/personalization features.
-- All columns nullable; existing rows backfilled separately by scripts/backfill-pool-taxonomy.ts.
-- New questions populate these at generation time (SoloQuestionGenerator + category generators updated).

ALTER TABLE question_pool
  -- Entity identification
  ADD COLUMN IF NOT EXISTS subject_type        TEXT
    CHECK (subject_type IS NULL OR subject_type IN
      ('player','team','league','trophy','match','manager','stadium','rule','transfer')),
  ADD COLUMN IF NOT EXISTS subject_id          TEXT,
  ADD COLUMN IF NOT EXISTS subject_name        TEXT,
  ADD COLUMN IF NOT EXISTS league_id           TEXT,

  -- Question character
  ADD COLUMN IF NOT EXISTS question_style      TEXT
    CHECK (question_style IS NULL OR question_style IN
      ('trivia','year','top5','multiple-choice','true-false','higher-or-lower','guess-score','player-id')),
  ADD COLUMN IF NOT EXISTS answer_type         TEXT,
  ADD COLUMN IF NOT EXISTS mode_compatibility  TEXT[],
  ADD COLUMN IF NOT EXISTS concept_id          TEXT,

  -- Scoring / telemetry (solve_rate + avg_time_ms backfilled nightly from answer logs)
  ADD COLUMN IF NOT EXISTS popularity_score    SMALLINT
    CHECK (popularity_score IS NULL OR popularity_score BETWEEN 1 AND 100),
  ADD COLUMN IF NOT EXISTS solve_rate          REAL
    CHECK (solve_rate IS NULL OR (solve_rate >= 0 AND solve_rate <= 1)),
  ADD COLUMN IF NOT EXISTS avg_time_ms         INTEGER
    CHECK (avg_time_ms IS NULL OR avg_time_ms >= 0),

  -- Content lifecycle
  ADD COLUMN IF NOT EXISTS time_sensitive      BOOLEAN DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS valid_until         DATE,
  ADD COLUMN IF NOT EXISTS tags                TEXT[];

COMMENT ON COLUMN question_pool.subject_type       IS 'Primary entity type this question is about. Enum; extend via ALTER CHECK when new types arise.';
COMMENT ON COLUMN question_pool.subject_id         IS 'Canonical slug of primary entity, e.g. "lionel-messi", "arsenal-fc". Validated against canonical-entities.json at generation time.';
COMMENT ON COLUMN question_pool.subject_name       IS 'Display name of subject for admin UI.';
COMMENT ON COLUMN question_pool.league_id          IS 'Specific league slug, e.g. "premier-league". Nullable when question is not league-scoped. Distinct from league_tier (abstraction level).';
COMMENT ON COLUMN question_pool.question_style     IS 'Shape of the question, not its content. Drives input UI + mode gating.';
COMMENT ON COLUMN question_pool.answer_type        IS 'Answer data type (matches AnswerType enum in common/interfaces/question.interface.ts).';
COMMENT ON COLUMN question_pool.mode_compatibility IS 'Game modes this question is safe to draw for: solo, duel, blitz, battle_royale, mayhem, hardcore, logo_quiz. NULL = unclassified.';
COMMENT ON COLUMN question_pool.concept_id         IS 'Underlying concept being tested, e.g. "world-cup-winners". Enables mastery tracking + spaced repetition across questions.';
COMMENT ON COLUMN question_pool.popularity_score   IS 'Fame of the subject (1-100). Decoupled from difficulty_score — obscure topics can have easy questions and vice versa.';
COMMENT ON COLUMN question_pool.solve_rate         IS 'Aggregate percent correct, computed nightly from answer logs. NULL until enough telemetry.';
COMMENT ON COLUMN question_pool.avg_time_ms        IS 'Average time-to-answer in ms, computed nightly. NULL until enough telemetry.';
COMMENT ON COLUMN question_pool.time_sensitive     IS 'True if the correct answer can change over time (e.g. "current Arsenal manager"). Use with valid_until.';
COMMENT ON COLUMN question_pool.valid_until        IS 'Expiry date after which time_sensitive questions must be re-verified.';
COMMENT ON COLUMN question_pool.tags               IS 'Loose secondary references (other entities, themes). Use subject_id for primary filter; use tags for discovery-style filters.';

-- Indexes sized for expected filter patterns.
-- subject_type is almost always queried with subject_id — composite covers both.
CREATE INDEX IF NOT EXISTS idx_question_pool_subject           ON question_pool(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_question_pool_league_id         ON question_pool(league_id);
CREATE INDEX IF NOT EXISTS idx_question_pool_concept_id        ON question_pool(concept_id);
CREATE INDEX IF NOT EXISTS idx_question_pool_popularity        ON question_pool(popularity_score);
CREATE INDEX IF NOT EXISTS idx_question_pool_mode_compat       ON question_pool USING GIN (mode_compatibility);
CREATE INDEX IF NOT EXISTS idx_question_pool_tags              ON question_pool USING GIN (tags);

-- Expiry index is partial: only rows that actually have valid_until set, which is a small subset.
CREATE INDEX IF NOT EXISTS idx_question_pool_valid_until       ON question_pool(valid_until) WHERE valid_until IS NOT NULL;
