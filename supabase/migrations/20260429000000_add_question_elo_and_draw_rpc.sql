-- Add question_elo column to question_pool for composite difficulty scoring
-- Formula: question_elo = 600 + (800 * erasure) + (400 * league_score) + (400 * team_score)
-- Range: 600 (easiest) to 2200 (hardest)

ALTER TABLE question_pool ADD COLUMN IF NOT EXISTS question_elo integer;

-- Partial index for efficient ELO-range lookups on logo quiz questions
CREATE INDEX IF NOT EXISTS idx_qp_logo_elo
  ON question_pool (category, question_elo)
  WHERE category = 'LOGO_QUIZ';

-- RPC: Draw logo quiz questions by ELO range instead of categorical difficulty.
-- Orders by closest ELO to target with random tiebreaking.
-- Marks drawn rows as used=true atomically.
CREATE OR REPLACE FUNCTION draw_logo_questions_by_elo(
  p_target_elo integer,
  p_range integer DEFAULT 200,
  p_count integer DEFAULT 1,
  p_exclude_ids text[] DEFAULT NULL
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
