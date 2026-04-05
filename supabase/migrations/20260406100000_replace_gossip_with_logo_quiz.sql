-- Replace GOSSIP (2 MEDIUM slots) with LOGO_QUIZ (2 EASY + 1 HARD = 3 slots)
-- on the game board. Total board changes from 17 to 18 questions (9 per player).
--
-- GOSSIP questions remain in question_pool but are never drawn.

DROP FUNCTION IF EXISTS draw_board(text[], uuid[]);

CREATE OR REPLACE FUNCTION draw_board(
  p_exclude_ids text[]   DEFAULT NULL,
  p_user_ids    uuid[]   DEFAULT NULL
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
DECLARE
  _drawn_ids  uuid[] := ARRAY[]::uuid[];
  _slot       RECORD;
  _q          RECORD;
BEGIN
  -- Reset used=true for any (cat, diff) slot that has zero available questions.
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
      ('LOGO_QUIZ',       'EASY'),
      ('LOGO_QUIZ',       'HARD')
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

  -- Draw each slot sequentially. Excludes questions already seen by any participant.
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
      ('LOGO_QUIZ',      'EASY',         2),
      ('LOGO_QUIZ',      'HARD',         1)
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
        -- Per-user dedup: skip if any participant has already seen this question.
        AND (
          p_user_ids IS NULL
          OR cardinality(p_user_ids) = 0
          OR NOT EXISTS (
            SELECT 1 FROM user_question_history uqh
            WHERE uqh.user_id = ANY(p_user_ids)
              AND uqh.question_id = (qp.question->>'id')::uuid
          )
        )
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

  -- Mark all drawn questions as used (concurrency lock for this game's lifetime).
  UPDATE question_pool
  SET used = true, used_at = now()
  WHERE question_pool.id = ANY(_drawn_ids);

  -- Record drawn questions in user_question_history for all participants.
  IF p_user_ids IS NOT NULL AND cardinality(p_user_ids) > 0 AND cardinality(_drawn_ids) > 0 THEN
    INSERT INTO user_question_history (user_id, question_id, seen_at)
    SELECT uid, (qp.question->>'id')::uuid, now()
    FROM question_pool qp
    CROSS JOIN UNNEST(p_user_ids) AS uid
    WHERE qp.id = ANY(_drawn_ids)
      AND (qp.question->>'id') IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;

  -- NEWS questions are ephemeral (7-day TTL) — not recorded in user history.
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
