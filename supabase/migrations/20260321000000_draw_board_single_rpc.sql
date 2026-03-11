-- Draw full board in a single RPC to reduce latency (was 18 separate draw_questions calls).
-- Matches DRAW_REQUIREMENTS in question-pool.service.ts.

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
  -- Draw all slots in one pass using LATERAL joins
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
    SELECT d.id, d.category, d.difficulty, d.question, d.translations
    FROM slot_defs s
    CROSS JOIN LATERAL (
      SELECT qp.id, qp.category, qp.difficulty, qp.question, COALESCE(qp.translations, '{}'::jsonb) AS translations
      FROM question_pool qp
      WHERE qp.used = false
        AND qp.category = s.cat
        AND qp.difficulty = s.diff
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
