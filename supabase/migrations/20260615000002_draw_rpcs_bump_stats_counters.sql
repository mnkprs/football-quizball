-- Phase 3: wire monotonic stats counters into every RPC that represents a
-- "question was shown to a user" event.
--
-- Updates:
--   - draw_board                          (board game)
--   - draw_questions                      (solo + logo-by-category)
--   - draw_logo_questions_by_elo (x2)     (two overloads, both for logo-quiz ELO matching)
--   - mark_blitz_questions_seen           (blitz/BR — doesn't flip `used`, bumps counters only)
--
-- Semantics:
--   - `times_shown`, `last_shown_at` are MONOTONIC — they only increment, never reset.
--   - `used`, `used_at` remain the recycling eligibility cursor (flipped back to false
--     by draw_board's auto-reset block when a slot drains).
--   - The blitz path uses `blitz_user_seen_questions` for per-user dedup and never flips
--     `used`, so this migration is the first place blitz draws get reflected in pool-wide
--     stats. Only newly-inserted user-seen rows trigger a bump (RETURNING from the INSERT)
--     to avoid over-counting on network retries.

-- ─────────────────────────────────────────────────────────────────────────────
-- draw_board
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.draw_board(p_exclude_ids text[] DEFAULT NULL::text[], p_user_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(id uuid, category text, difficulty text, question jsonb, translations jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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

  -- Mark all drawn questions as used + bump monotonic counters.
  UPDATE question_pool
  SET used          = true,
      used_at       = now(),
      times_shown   = times_shown + 1,
      last_shown_at = now()
  WHERE question_pool.id = ANY(_drawn_ids);

  IF p_user_ids IS NOT NULL AND cardinality(p_user_ids) > 0 AND cardinality(_drawn_ids) > 0 THEN
    INSERT INTO user_question_history (user_id, question_id, seen_at)
    SELECT uid, (qp.question->>'id')::uuid, now()
    FROM question_pool qp
    CROSS JOIN UNNEST(p_user_ids) AS uid
    WHERE qp.id = ANY(_drawn_ids)
      AND (qp.question->>'id') IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;

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
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- draw_questions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.draw_questions(p_category text, p_difficulty text, p_count integer DEFAULT 1, p_exclude_ids text[] DEFAULT NULL::text[], p_max_elo integer DEFAULT NULL::integer)
 RETURNS TABLE(id uuid, category text, difficulty text, question jsonb, translations jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH drawn AS (
    SELECT qp.id, qp.category, qp.question, COALESCE(qp.translations, '{}'::jsonb) AS translations
    FROM question_pool qp
    WHERE qp.used = false
      AND qp.category = p_category
      AND p_difficulty = ANY(COALESCE(qp.allowed_difficulties, ARRAY[qp.difficulty]))
      AND (p_max_elo IS NULL OR qp.question_elo IS NULL OR qp.question_elo <= p_max_elo)
      AND (p_exclude_ids IS NULL OR cardinality(p_exclude_ids) = 0 OR (qp.question->>'id') IS NULL OR NOT ((qp.question->>'id') = ANY(p_exclude_ids)))
    ORDER BY random()
    LIMIT p_count
    FOR UPDATE
  ),
  updated AS (
    UPDATE question_pool qp
    SET used          = true,
        used_at       = now(),
        times_shown   = times_shown + 1,
        last_shown_at = now()
    FROM drawn d
    WHERE qp.id = d.id
      AND qp.category != 'NEWS'
  )
  SELECT d.id, d.category::text, p_difficulty, d.question, d.translations FROM drawn d;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- draw_logo_questions_by_elo (4-arg overload, no p_max_elo)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.draw_logo_questions_by_elo(p_target_elo integer, p_range integer DEFAULT 200, p_count integer DEFAULT 1, p_exclude_ids text[] DEFAULT NULL::text[])
 RETURNS TABLE(id uuid, category text, difficulty text, question jsonb, translations jsonb, question_elo integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
    UPDATE question_pool qp
    SET used          = true,
        used_at       = now(),
        times_shown   = times_shown + 1,
        last_shown_at = now()
    FROM drawn d
    WHERE qp.id = d.id
  )
  SELECT d.id, d.category::text, d.difficulty::text, d.question, d.translations, d.question_elo
  FROM drawn d;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- draw_logo_questions_by_elo (5-arg overload, with p_max_elo for free-pool gating)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.draw_logo_questions_by_elo(p_target_elo integer, p_range integer DEFAULT 200, p_count integer DEFAULT 1, p_exclude_ids text[] DEFAULT NULL::text[], p_max_elo integer DEFAULT NULL::integer)
 RETURNS TABLE(id uuid, category text, difficulty text, question jsonb, translations jsonb, question_elo integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
      AND (p_max_elo IS NULL OR qp.question_elo <= p_max_elo)
      AND (p_exclude_ids IS NULL OR cardinality(p_exclude_ids) = 0
           OR NOT ((qp.question->>'id') = ANY(p_exclude_ids)))
    ORDER BY ABS(qp.question_elo - p_target_elo), random()
    LIMIT p_count
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE question_pool qp
    SET used          = true,
        used_at       = now(),
        times_shown   = times_shown + 1,
        last_shown_at = now()
    FROM drawn d
    WHERE qp.id = d.id
  )
  SELECT d.id, d.category::text, d.difficulty::text, d.question, d.translations, d.question_elo
  FROM drawn d;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- mark_blitz_questions_seen
-- Blitz draws don't flip `used` (they rely on blitz_user_seen_questions for
-- per-user dedup). This is the first place a pool-wide "shown" event can be
-- recorded for blitz questions. Bump only for newly-inserted rows to avoid
-- over-counting on retries.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_blitz_questions_seen(p_user_id uuid, p_question_ids uuid[])
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  WITH inserted AS (
    INSERT INTO blitz_user_seen_questions (user_id, question_id)
    SELECT p_user_id, unnest(p_question_ids)
    ON CONFLICT DO NOTHING
    RETURNING question_id
  )
  UPDATE question_pool
  SET times_shown   = times_shown + 1,
      last_shown_at = now()
  FROM inserted
  WHERE question_pool.id = inserted.question_id;
$function$;
