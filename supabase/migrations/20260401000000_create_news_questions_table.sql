-- Move news questions to a dedicated news_questions table.
-- Separates ephemeral news content from the main question_pool.
-- News questions are recycled (never marked used) and expire after 7 days.

-- 1. Create dedicated table
CREATE TABLE IF NOT EXISTS news_questions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  question          jsonb       NOT NULL,
  translations      jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  generation_version text,
  expires_at        timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

CREATE INDEX IF NOT EXISTS idx_news_questions_expires_at ON news_questions (expires_at);
CREATE INDEX IF NOT EXISTS idx_news_questions_created_at ON news_questions (created_at DESC);

-- 2. Migrate existing (non-expired) NEWS questions from question_pool
INSERT INTO news_questions (question, translations, created_at, generation_version, expires_at)
SELECT
  question,
  translations,
  COALESCE(created_at, now()),
  generation_version,
  COALESCE(created_at, now()) + interval '7 days'
FROM question_pool
WHERE category = 'NEWS'
  AND COALESCE(created_at, now()) > now() - interval '7 days';

-- 3. Remove all NEWS rows from question_pool
DELETE FROM question_pool WHERE category = 'NEWS';

-- 4. Update expire_news_questions to target news_questions
CREATE OR REPLACE FUNCTION expire_news_questions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM news_questions WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- 5. Update draw_questions: NEWS draws from news_questions, others from question_pool
DROP FUNCTION IF EXISTS draw_questions(text, text, int);
DROP FUNCTION IF EXISTS draw_questions(text, text, int, text[]);

CREATE FUNCTION draw_questions(
  p_category    text,
  p_difficulty  text,
  p_count       int     DEFAULT 1,
  p_exclude_ids text[]  DEFAULT NULL
)
RETURNS TABLE (
  id           uuid,
  category     text,
  difficulty   text,
  question     jsonb,
  translations jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_category = 'NEWS' THEN
    RETURN QUERY
    SELECT
      nq.id,
      'NEWS'::text                              AS category,
      'MEDIUM'::text                            AS difficulty,
      nq.question,
      COALESCE(nq.translations, '{}'::jsonb)   AS translations
    FROM news_questions nq
    WHERE nq.expires_at > now()
      AND (p_exclude_ids IS NULL OR cardinality(p_exclude_ids) = 0
           OR (nq.question->>'id') IS NULL
           OR NOT ((nq.question->>'id') = ANY(p_exclude_ids)))
    ORDER BY random()
    LIMIT p_count;
  ELSE
    RETURN QUERY
    WITH drawn AS (
      SELECT qp.id, qp.category, qp.difficulty, qp.question,
             COALESCE(qp.translations, '{}'::jsonb) AS translations
      FROM question_pool qp
      WHERE qp.used = false
        AND qp.category = p_category
        AND qp.difficulty = p_difficulty
        AND (p_exclude_ids IS NULL OR cardinality(p_exclude_ids) = 0
             OR (qp.question->>'id') IS NULL
             OR NOT ((qp.question->>'id') = ANY(p_exclude_ids)))
      ORDER BY random()
      LIMIT p_count
      FOR UPDATE
    ),
    updated AS (
      UPDATE question_pool qp
      SET used = true, used_at = now()
      FROM drawn d
      WHERE qp.id = d.id
    )
    SELECT d.id, d.category::text, d.difficulty::text, d.question, d.translations FROM drawn d;
  END IF;
END;
$$;

-- 6. Update draw_board: NEWS slot drawn from news_questions
CREATE OR REPLACE FUNCTION draw_board(p_exclude_ids text[] DEFAULT NULL)
RETURNS TABLE (
  id           uuid,
  category     text,
  difficulty   text,
  question     jsonb,
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
      ('HISTORY',           'MEDIUM', 1),
      ('HISTORY',           'HARD',   1),
      ('PLAYER_ID',         'MEDIUM', 2),
      ('HIGHER_OR_LOWER',   'MEDIUM', 2),
      ('GUESS_SCORE',       'EASY',   1),
      ('GUESS_SCORE',       'MEDIUM', 1),
      ('GUESS_SCORE',       'HARD',   1),
      ('TOP_5',             'HARD',   2),
      ('GEOGRAPHY',         'EASY',   1),
      ('GEOGRAPHY',         'MEDIUM', 1),
      ('GEOGRAPHY',         'HARD',   1),
      ('GOSSIP',            'MEDIUM', 2)
    ) AS t(cat, diff, cnt)
  ),
  drawn AS (
    SELECT d.id, d.category, d.difficulty, d.question, d.translations
    FROM slot_defs s
    CROSS JOIN LATERAL (
      SELECT qp.id, qp.category, qp.difficulty, qp.question,
             COALESCE(qp.translations, '{}'::jsonb) AS translations
      FROM question_pool qp
      WHERE qp.used = false
        AND qp.category = s.cat
        AND qp.difficulty = s.diff
        AND (p_exclude_ids IS NULL OR cardinality(p_exclude_ids) = 0
             OR (qp.question->>'id') IS NULL
             OR NOT ((qp.question->>'id') = ANY(p_exclude_ids)))
      ORDER BY random()
      LIMIT s.cnt
      FOR UPDATE SKIP LOCKED
    ) d
  ),
  news_drawn AS (
    SELECT
      nq.id,
      'NEWS'::text                             AS category,
      'MEDIUM'::text                           AS difficulty,
      nq.question,
      COALESCE(nq.translations, '{}'::jsonb)  AS translations
    FROM news_questions nq
    WHERE nq.expires_at > now()
      AND (p_exclude_ids IS NULL OR cardinality(p_exclude_ids) = 0
           OR (nq.question->>'id') IS NULL
           OR NOT ((nq.question->>'id') = ANY(p_exclude_ids)))
    ORDER BY random()
    LIMIT 2
  ),
  updated AS (
    UPDATE question_pool qp
    SET used = true, used_at = now()
    FROM drawn d
    WHERE qp.id = d.id
  )
  SELECT drawn.id, drawn.category::text, drawn.difficulty::text, drawn.question, drawn.translations FROM drawn
  UNION ALL
  SELECT news_drawn.id, news_drawn.category, news_drawn.difficulty, news_drawn.question, news_drawn.translations FROM news_drawn;
END;
$$;

-- 7. Update get_seed_pool_stats: NEWS stats from news_questions
DROP FUNCTION IF EXISTS get_seed_pool_stats(text);

CREATE FUNCTION get_seed_pool_stats(p_generation_version text DEFAULT NULL)
RETURNS TABLE (
  category             text,
  difficulty           text,
  unanswered           bigint,
  answered             bigint,
  drawable_unanswered  bigint,
  drawable_answered    bigint
) AS $$
BEGIN
  RETURN QUERY
  WITH pool_filtered AS (
    SELECT qp.*
    FROM question_pool qp
    WHERE (p_generation_version IS NULL OR p_generation_version = '')
       OR (p_generation_version = 'legacy' AND qp.generation_version IS NULL)
       OR (p_generation_version IS NOT NULL AND p_generation_version != '' AND p_generation_version != 'legacy' AND qp.generation_version = p_generation_version)
  ),
  slot_defs AS (
    SELECT DISTINCT cat, diff FROM (VALUES
      ('HISTORY'::text,       'EASY'::text),
      ('HISTORY',             'MEDIUM'),
      ('HISTORY',             'HARD'),
      ('PLAYER_ID',           'MEDIUM'),
      ('HIGHER_OR_LOWER',     'MEDIUM'),
      ('GUESS_SCORE',         'EASY'),
      ('GUESS_SCORE',         'MEDIUM'),
      ('GUESS_SCORE',         'HARD'),
      ('TOP_5',               'HARD'),
      ('GEOGRAPHY',           'EASY'),
      ('GEOGRAPHY',           'MEDIUM'),
      ('GEOGRAPHY',           'HARD'),
      ('GOSSIP',              'MEDIUM')
    ) AS t(cat, diff)
  ),
  primary_stats AS (
    SELECT
      qp.category,
      qp.difficulty,
      COUNT(*) FILTER (WHERE qp.used = false) AS unanswered,
      COUNT(*) FILTER (WHERE qp.used = true)  AS answered
    FROM pool_filtered qp
    GROUP BY qp.category, qp.difficulty
  ),
  drawable_stats AS (
    SELECT
      qp.category,
      s.diff AS difficulty,
      COUNT(*) FILTER (WHERE qp.used = false) AS drawable_unanswered,
      COUNT(*) FILTER (WHERE qp.used = true)  AS drawable_answered
    FROM pool_filtered qp
    CROSS JOIN LATERAL unnest(COALESCE(qp.allowed_difficulties, ARRAY[qp.difficulty])) AS slot_difficulty
    JOIN slot_defs s ON s.cat = qp.category AND s.diff = slot_difficulty
    GROUP BY qp.category, s.diff
  ),
  pool_result AS (
    SELECT
      s.cat::text                                        AS category,
      s.diff::text                                       AS difficulty,
      COALESCE(p.unanswered, 0)::bigint                 AS unanswered,
      COALESCE(p.answered, 0)::bigint                   AS answered,
      COALESCE(d.drawable_unanswered, 0)::bigint        AS drawable_unanswered,
      COALESCE(d.drawable_answered, 0)::bigint          AS drawable_answered
    FROM slot_defs s
    LEFT JOIN primary_stats p  ON p.category = s.cat AND p.difficulty = s.diff
    LEFT JOIN drawable_stats d ON d.category = s.cat AND d.difficulty = s.diff
  ),
  news_stats AS (
    SELECT
      'NEWS'::text                                                          AS category,
      'MEDIUM'::text                                                        AS difficulty,
      COUNT(*) FILTER (WHERE nq.expires_at > now())::bigint                AS unanswered,
      COUNT(*) FILTER (WHERE nq.expires_at <= now())::bigint               AS answered,
      COUNT(*) FILTER (WHERE nq.expires_at > now())::bigint                AS drawable_unanswered,
      COUNT(*) FILTER (WHERE nq.expires_at <= now())::bigint               AS drawable_answered
    FROM news_questions nq
    WHERE (p_generation_version IS NULL OR p_generation_version = '')
       OR (p_generation_version = 'legacy' AND nq.generation_version IS NULL)
       OR (p_generation_version IS NOT NULL AND p_generation_version != '' AND p_generation_version != 'legacy' AND nq.generation_version = p_generation_version)
  )
  SELECT * FROM pool_result
  UNION ALL
  SELECT * FROM news_stats
  ORDER BY category, difficulty;
END;
$$ LANGUAGE plpgsql STABLE;
