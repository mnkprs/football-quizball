-- Extend draw_board to accept user IDs and record per-user question history.
-- This replaces the global-used-forever approach with a two-layer strategy:
--   Layer 1: used=true while a game is active (returned when game ends).
--   Layer 2: user_question_history (60-day per-user dedup).
--
-- Also adds:
--   * record_board_question_history() — records history for users who join after draw (guests).
--   * reset_board_history_if_exhausted() — clears a user's history when >80% of pool is seen.
--   * cleanup_old_question_history() updated to 60-day window (was 30 days).

-- 1. Drop old signature (param list changed) and recreate.
DROP FUNCTION IF EXISTS draw_board(text[]);

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
  -- The question_id stored is the content UUID from question->>'id', consistent with solo mode.
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

-- 2. Record board history for users who join after the board was drawn (e.g. guest joining).
--    p_question_ids = content IDs (text[] from pool_question_ids column).
CREATE OR REPLACE FUNCTION record_board_question_history(
  p_user_ids     uuid[],
  p_question_ids text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_user_ids IS NULL OR cardinality(p_user_ids) = 0 THEN RETURN; END IF;
  IF p_question_ids IS NULL OR cardinality(p_question_ids) = 0 THEN RETURN; END IF;

  INSERT INTO user_question_history (user_id, question_id, seen_at)
  SELECT uid, qid::uuid, now()
  FROM UNNEST(p_user_ids) AS uid
  CROSS JOIN UNNEST(p_question_ids) AS qid
  ON CONFLICT DO NOTHING;
END;
$$;

-- 3. Auto-reset a user's board question history when they have seen > 80% of the pool.
--    Returns true if history was reset, false otherwise.
CREATE OR REPLACE FUNCTION reset_board_history_if_exhausted(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total bigint;
  v_seen  bigint;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM question_pool
  WHERE used = false
    AND category NOT IN ('NEWS');

  IF v_total = 0 THEN RETURN false; END IF;

  SELECT COUNT(*) INTO v_seen
  FROM user_question_history uqh
  JOIN question_pool qp ON (qp.question->>'id')::uuid = uqh.question_id
  WHERE uqh.user_id = p_user_id
    AND qp.category NOT IN ('NEWS');

  IF (v_seen::float / v_total::float) > 0.8 THEN
    DELETE FROM user_question_history WHERE user_id = p_user_id;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- 4. Update cleanup to 60-day window (was 30 days).
--    Run daily — keeps the table bounded so queries need no seen_at filter.
CREATE OR REPLACE FUNCTION cleanup_old_question_history() RETURNS void
LANGUAGE sql SECURITY DEFINER AS $$
  DELETE FROM user_question_history WHERE seen_at < now() - INTERVAL '60 days';
$$;
