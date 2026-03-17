-- Fix cleanup_question_pool to deduplicate GUESS_SCORE by match identity
-- (teams + competition + year), not by score.
-- Two different matches with the same score (e.g. 2-0) are different questions.
-- Same match stored as "Germany vs Brazil" and "Brazil vs Germany" is a true duplicate —
-- caught by sorting the two team names alphabetically.
CREATE OR REPLACE FUNCTION cleanup_question_pool()
RETURNS TABLE(deleted_invalid bigint, deleted_duplicates bigint)
LANGUAGE plpgsql
AS $$
DECLARE
  v_invalid bigint := 0;
  v_dupes bigint := 0;
BEGIN
  -- Remove invalid questions (missing required fields)
  WITH invalid AS (
    DELETE FROM question_pool
    WHERE
      (question->>'question_text') IS NULL
      OR trim(question->>'question_text') = ''
      OR (question->>'correct_answer') IS NULL
      OR trim(question->>'correct_answer') = ''
      OR (question->>'id') IS NULL
      OR trim(question->>'id') = ''
    RETURNING id
  )
  SELECT COUNT(*)::bigint INTO v_invalid FROM invalid;

  -- Deduplicate non-GUESS_SCORE by exact answer (excluding HIGHER_OR_LOWER)
  WITH normalized AS (
    SELECT id, category, difficulty,
      lower(trim(question->>'correct_answer')) AS norm_answer
    FROM question_pool
    WHERE category != 'HIGHER_OR_LOWER'
      AND category != 'GUESS_SCORE'
  ),
  dup_ids AS (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY category, difficulty, norm_answer ORDER BY id
      ) AS rn
      FROM normalized
    ) t WHERE rn > 1
  ),
  deleted AS (
    DELETE FROM question_pool WHERE id IN (SELECT id FROM dup_ids) RETURNING id
  )
  SELECT COUNT(*)::bigint INTO v_dupes FROM deleted;

  -- Deduplicate GUESS_SCORE by match identity: sorted team names + competition + year
  -- Sorting teams alphabetically catches "Germany vs Brazil" == "Brazil vs Germany"
  WITH gs_normalized AS (
    SELECT id,
      LEAST(
        lower(trim(question->'meta'->>'home_team')),
        lower(trim(question->'meta'->>'away_team'))
      ) || '|' ||
      GREATEST(
        lower(trim(question->'meta'->>'home_team')),
        lower(trim(question->'meta'->>'away_team'))
      ) || '|' ||
      lower(trim(coalesce(question->'meta'->>'competition', ''))) || '|' ||
      coalesce(question->'meta'->>'event_year', question->>'event_year', '') AS match_key
    FROM question_pool
    WHERE category = 'GUESS_SCORE'
      AND question->'meta'->>'home_team' IS NOT NULL
      AND question->'meta'->>'away_team' IS NOT NULL
  ),
  gs_dup_ids AS (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY match_key ORDER BY id
      ) AS rn
      FROM gs_normalized
    ) t WHERE rn > 1
  ),
  gs_deleted AS (
    DELETE FROM question_pool WHERE id IN (SELECT id FROM gs_dup_ids) RETURNING id
  )
  SELECT v_dupes + COUNT(*)::bigint INTO v_dupes FROM gs_deleted;

  deleted_invalid := v_invalid;
  deleted_duplicates := v_dupes;
  RETURN NEXT;
END;
$$;

-- Run cleanup immediately
SELECT * FROM cleanup_question_pool();
