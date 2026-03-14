-- draw_board: two fixes:
-- 1. Match on allowed_difficulties (not just stored difficulty) so boundary questions can fill adjacent slots.
-- 2. Auto-reset used=true for any slot exhausted of available questions.

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
  -- Reset used=true for any (cat, diff) slot that has zero questions available
  -- (checking allowed_difficulties so boundary questions are counted)
  UPDATE question_pool qp
  SET used = false, used_at = NULL
  FROM (
    SELECT * FROM (VALUES
      ('HISTORY'::text,   'EASY'::text),
      ('HISTORY',         'MEDIUM'),
      ('HISTORY',         'HARD'),
      ('PLAYER_ID',       'MEDIUM'),
      ('HIGHER_OR_LOWER', 'MEDIUM'),
      ('GUESS_SCORE',     'EASY'),
      ('GUESS_SCORE',     'MEDIUM'),
      ('GUESS_SCORE',     'HARD'),
      ('TOP_5',           'HARD'),
      ('GEOGRAPHY',       'EASY'),
      ('GEOGRAPHY',       'MEDIUM'),
      ('GEOGRAPHY',       'HARD'),
      ('GOSSIP',          'MEDIUM')
    ) AS s(cat, diff)
    WHERE NOT EXISTS (
      SELECT 1 FROM question_pool q2
      WHERE q2.used = false
        AND q2.category = s.cat
        AND s.diff = ANY(COALESCE(q2.allowed_difficulties, ARRAY[q2.difficulty]))
    )
  ) empty_slots
  WHERE qp.category = empty_slots.cat
    AND empty_slots.diff = ANY(COALESCE(qp.allowed_difficulties, ARRAY[qp.difficulty]));

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
      ('GOSSIP',            'MEDIUM', 2),
      ('NEWS',              'MEDIUM', 2)
    ) AS t(cat, diff, cnt)
  ),
  drawn AS (
    SELECT d.id, d.category, s.diff AS difficulty, d.question, d.translations
    FROM slot_defs s
    CROSS JOIN LATERAL (
      SELECT qp.id, qp.category, qp.question,
             COALESCE(qp.translations, '{}'::jsonb) AS translations
      FROM question_pool qp
      WHERE qp.used = false
        AND qp.category = s.cat
        AND s.cat != 'NEWS'
        AND s.diff = ANY(COALESCE(qp.allowed_difficulties, ARRAY[qp.difficulty]))
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
      'NEWS'::text                            AS category,
      'MEDIUM'::text                          AS difficulty,
      nq.question,
      COALESCE(nq.translations, '{}'::jsonb) AS translations
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
