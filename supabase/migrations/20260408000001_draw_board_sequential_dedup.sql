-- Replace CROSS JOIN LATERAL with a sequential slot loop.
-- Each slot excludes question IDs already drawn for earlier slots,
-- eliminating same-question collisions when allowed_difficulties spans
-- multiple difficulty tiers.

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
DECLARE
  _drawn_ids  uuid[] := ARRAY[]::uuid[];
  _slot       RECORD;
  _q          RECORD;
BEGIN
  -- Reset used=true for any (cat, diff) slot that has zero questions available
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

  -- Draw each slot sequentially. Already-drawn IDs are excluded from every
  -- subsequent pick, so a cross-difficulty question can never fill two slots.
  FOR _slot IN
    SELECT * FROM (VALUES
      ('HISTORY'::text,  'EASY'::text,   1::int),
      ('HISTORY',        'MEDIUM',       1),
      ('HISTORY',        'HARD',         1),
      ('PLAYER_ID',      'MEDIUM',       2),
      ('HIGHER_OR_LOWER','MEDIUM',       2),
      ('GUESS_SCORE',    'EASY',         1),
      ('GUESS_SCORE',    'MEDIUM',       1),
      ('GUESS_SCORE',    'HARD',         1),
      ('TOP_5',          'HARD',         2),
      ('GEOGRAPHY',      'EASY',         1),
      ('GEOGRAPHY',      'MEDIUM',       1),
      ('GEOGRAPHY',      'HARD',         1),
      ('GOSSIP',         'MEDIUM',       2)
    ) AS t(cat, diff, cnt)
  LOOP
    FOR _q IN
      SELECT qp.id, qp.question,
             COALESCE(qp.translations, '{}'::jsonb) AS translations
      FROM question_pool qp
      WHERE qp.used = false
        AND qp.category = _slot.cat
        AND _slot.diff = ANY(COALESCE(qp.allowed_difficulties, ARRAY[qp.difficulty]))
        AND NOT (qp.id = ANY(_drawn_ids))
        AND (p_exclude_ids IS NULL OR cardinality(p_exclude_ids) = 0
             OR (qp.question->>'id') IS NULL
             OR NOT ((qp.question->>'id') = ANY(p_exclude_ids)))
      ORDER BY random(), qp.id
      LIMIT _slot.cnt
      FOR UPDATE
    LOOP
      _drawn_ids   := _drawn_ids || _q.id;
      id           := _q.id;
      category     := _slot.cat;
      difficulty   := _slot.diff;
      question     := _q.question;
      translations := _q.translations;
      RETURN NEXT;
    END LOOP;
  END LOOP;

  -- Mark all drawn pool questions as used in one shot (rows are already locked)
  UPDATE question_pool
  SET used = true, used_at = now()
  WHERE question_pool.id = ANY(_drawn_ids);

  -- NEWS draws from a separate table — no dedup needed against question_pool
  RETURN QUERY
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
  LIMIT 2;
END;
$$;
