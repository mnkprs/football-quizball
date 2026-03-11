-- Update RPCs to use questions_v1 (table was renamed from questions_v2 by user).

-- Update draw_questions to read from questions_v1
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
    SELECT qp.id, qp.category, qp.difficulty, qp.question, COALESCE(qp.translations, '{}'::jsonb) AS translations
    FROM questions_v1 qp
    WHERE qp.used = false
      AND qp.category = p_category
      AND qp.difficulty = p_difficulty
      AND (p_exclude_ids IS NULL OR cardinality(p_exclude_ids) = 0 OR (qp.question->>'id') IS NULL OR NOT ((qp.question->>'id') = ANY(p_exclude_ids)))
    ORDER BY random()
    LIMIT p_count
    FOR UPDATE
  ),
  updated AS (
    UPDATE questions_v1 qp
    SET used = true
    FROM drawn d
    WHERE qp.id = d.id
  )
  SELECT d.id, d.category::text, d.difficulty::text, d.question, d.translations FROM drawn d;
END;
$$;

-- Update return_questions_to_pool to use questions_v1
CREATE OR REPLACE FUNCTION return_questions_to_pool(p_question_ids text[])
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE questions_v1
  SET used = false
  WHERE used = true
    AND (question->>'id') = ANY(p_question_ids);

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

-- Update get_seed_pool_stats to use questions_v1
CREATE OR REPLACE FUNCTION get_seed_pool_stats()
RETURNS TABLE (
  category text,
  difficulty text,
  unanswered bigint,
  answered bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    qp.category::text,
    qp.difficulty::text,
    COUNT(*) FILTER (WHERE qp.used = false) AS unanswered,
    COUNT(*) FILTER (WHERE qp.used = true) AS answered
  FROM questions_v1 qp
  GROUP BY qp.category, qp.difficulty
  ORDER BY qp.category, qp.difficulty;
END;
$$ LANGUAGE plpgsql;

-- Update cleanup_question_pool to work on questions_v1
CREATE OR REPLACE FUNCTION cleanup_question_pool()
RETURNS TABLE(deleted_invalid bigint, deleted_duplicates bigint)
LANGUAGE plpgsql
AS $$
DECLARE
  v_invalid bigint := 0;
  v_dupes bigint := 0;
BEGIN
  WITH invalid AS (
    DELETE FROM questions_v1
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

  WITH normalized AS (
    SELECT id, category, difficulty, lower(trim(question->>'correct_answer')) AS norm_answer
    FROM questions_v1
    WHERE category != 'HIGHER_OR_LOWER'
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
    DELETE FROM questions_v1 WHERE id IN (SELECT id FROM dup_ids) RETURNING id
  )
  SELECT COUNT(*)::bigint INTO v_dupes FROM deleted;

  deleted_invalid := v_invalid;
  deleted_duplicates := v_dupes;
  RETURN NEXT;
END;
$$;

-- Update expire_news_questions to use questions_v1
CREATE OR REPLACE FUNCTION expire_news_questions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM questions_v1
  WHERE category = 'NEWS'
    AND created_at < now() - interval '7 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
