-- Migration: Add p_max_elo parameter to logo RPCs + free pool cutoff RPC
-- This supports the free/pro logo pool feature where free tier users are limited
-- to questions with lower ELO values (less popular/easier teams).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Update draw_logo_questions_by_elo: add optional p_max_elo parameter
--    When p_max_elo is non-null, only questions with question_elo <= p_max_elo
--    are eligible, restricting draws to the free-tier pool.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION draw_logo_questions_by_elo(
  p_target_elo integer,
  p_range integer DEFAULT 200,
  p_count integer DEFAULT 1,
  p_exclude_ids text[] DEFAULT NULL,
  -- New optional param: when set, caps the maximum question_elo (free pool gate)
  p_max_elo integer DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  category text,
  difficulty text,
  question jsonb,
  translations jsonb,
  question_elo integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH drawn AS (
    SELECT qp.id, qp.category, qp.difficulty, qp.question,
           COALESCE(qp.translations, '{}'::jsonb) AS translations,
           qp.question_elo
    FROM question_pool qp
    WHERE qp.used = false
      AND qp.category = 'LOGO_QUIZ'
      AND qp.question_elo IS NOT NULL
      AND qp.question_elo BETWEEN (p_target_elo - p_range) AND (p_target_elo + p_range)
      -- Free pool gate: restrict to questions at or below the cutoff ELO
      AND (p_max_elo IS NULL OR qp.question_elo <= p_max_elo)
      AND (p_exclude_ids IS NULL OR cardinality(p_exclude_ids) = 0
           OR NOT ((qp.question->>'id') = ANY(p_exclude_ids)))
    ORDER BY ABS(qp.question_elo - p_target_elo), random()
    LIMIT p_count
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE question_pool qp SET used = true FROM drawn d WHERE qp.id = d.id
  )
  SELECT d.id, d.category::text, d.difficulty::text, d.question, d.translations, d.question_elo
  FROM drawn d;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Update draw_questions: add optional p_max_elo parameter
--    When p_max_elo is non-null, only questions with question_elo <= p_max_elo
--    are eligible, allowing callers to gate draws to the free-tier pool.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION draw_questions(
  p_category text,
  p_difficulty text,
  p_count int DEFAULT 1,
  p_exclude_ids text[] DEFAULT NULL,
  -- New optional param: when set, caps the maximum question_elo (free pool gate)
  p_max_elo integer DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  category text,
  difficulty text,
  question jsonb,
  translations jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH drawn AS (
    SELECT qp.id, qp.category, qp.question, COALESCE(qp.translations, '{}'::jsonb) AS translations
    FROM question_pool qp
    WHERE qp.used = false
      AND qp.category = p_category
      AND p_difficulty = ANY(COALESCE(qp.allowed_difficulties, ARRAY[qp.difficulty]))
      -- Free pool gate: restrict to questions at or below the cutoff ELO
      AND (p_max_elo IS NULL OR qp.question_elo IS NULL OR qp.question_elo <= p_max_elo)
      AND (p_exclude_ids IS NULL OR cardinality(p_exclude_ids) = 0 OR (qp.question->>'id') IS NULL OR NOT ((qp.question->>'id') = ANY(p_exclude_ids)))
    ORDER BY random()
    LIMIT p_count
    FOR UPDATE
  ),
  updated AS (
    UPDATE question_pool qp
    SET used = true, used_at = now()
    FROM drawn d
    WHERE qp.id = d.id
      AND qp.category != 'NEWS'
  )
  SELECT d.id, d.category::text, p_difficulty, d.question, d.translations FROM drawn d;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. New function: get_free_logo_cutoff
--    Returns the question_elo of the Nth logo question (ordered ascending by ELO).
--    Used to determine the maximum ELO threshold for the free-tier logo pool.
--    Example: get_free_logo_cutoff(100) → ELO of the 100th easiest logo question.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_free_logo_cutoff(
  p_pool_size integer DEFAULT 100
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT question_elo
  FROM question_pool
  WHERE category = 'LOGO_QUIZ'
    AND question_elo IS NOT NULL
  ORDER BY question_elo ASC
  LIMIT 1
  OFFSET (p_pool_size - 1);
$$;
