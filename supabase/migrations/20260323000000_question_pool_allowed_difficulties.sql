-- Add allowed_difficulties for cross-level usability (e.g. MEDIUM questions near EASY boundary can fill EASY slots).
-- Update draw_questions and draw_board to match on allowed set; return slot difficulty for correct points/display.

ALTER TABLE question_pool
  ADD COLUMN IF NOT EXISTS allowed_difficulties text[];

COMMENT ON COLUMN question_pool.allowed_difficulties IS 'Difficulty levels this question can be drawn for. Defaults to [difficulty] for backward compatibility.';

-- Backfill existing rows: each question is usable only in its stored difficulty
UPDATE question_pool
SET allowed_difficulties = ARRAY[difficulty]
WHERE allowed_difficulties IS NULL;

-- Update draw_questions: match on allowed_difficulties, return slot difficulty
DROP FUNCTION IF EXISTS draw_questions(text, text, int);
DROP FUNCTION IF EXISTS draw_questions(text, text, int, text[]);

CREATE OR REPLACE FUNCTION draw_questions(
  p_category text,
  p_difficulty text,
  p_count int DEFAULT 1,
  p_exclude_ids text[] DEFAULT NULL
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

-- Update draw_board: match on allowed_difficulties, return slot difficulty
CREATE OR REPLACE FUNCTION draw_board(p_exclude_ids text[] DEFAULT NULL)
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
  WITH slot_defs AS (
    SELECT * FROM (VALUES
      ('HISTORY'::text, 'EASY'::text, 1),
      ('HISTORY', 'MEDIUM', 1),
      ('HISTORY', 'HARD', 1),
      ('PLAYER_ID', 'MEDIUM', 2),
      ('HIGHER_OR_LOWER', 'MEDIUM', 2),
      ('GUESS_SCORE', 'EASY', 1),
      ('GUESS_SCORE', 'MEDIUM', 1),
      ('GUESS_SCORE', 'HARD', 1),
      ('TOP_5', 'HARD', 2),
      ('GEOGRAPHY', 'EASY', 1),
      ('GEOGRAPHY', 'MEDIUM', 1),
      ('GEOGRAPHY', 'HARD', 1),
      ('GOSSIP', 'MEDIUM', 2),
      ('NEWS', 'MEDIUM', 2)
    ) AS t(cat, diff, cnt)
  ),
  drawn AS (
    SELECT d.id, d.category, s.diff AS difficulty, d.question, d.translations
    FROM slot_defs s
    CROSS JOIN LATERAL (
      SELECT qp.id, qp.category, qp.question, COALESCE(qp.translations, '{}'::jsonb) AS translations
      FROM question_pool qp
      WHERE qp.used = false
        AND qp.category = s.cat
        AND s.diff = ANY(COALESCE(qp.allowed_difficulties, ARRAY[qp.difficulty]))
        AND (p_exclude_ids IS NULL OR cardinality(p_exclude_ids) = 0 OR (qp.question->>'id') IS NULL OR NOT ((qp.question->>'id') = ANY(p_exclude_ids)))
      ORDER BY random()
      LIMIT s.cnt
      FOR UPDATE SKIP LOCKED
    ) d
  ),
  updated AS (
    UPDATE question_pool qp
    SET used = true, used_at = now()
    FROM drawn d
    WHERE qp.id = d.id
      AND qp.category != 'NEWS'
  )
  SELECT drawn.id, drawn.category::text, drawn.difficulty::text, drawn.question, drawn.translations
  FROM drawn;
END;
$$;
