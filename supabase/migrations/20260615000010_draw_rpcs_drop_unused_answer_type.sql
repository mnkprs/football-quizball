-- Trim unused `answer_type` column from draw RPC returns.
--
-- Context: migration 20260615000008 added image_url, source_url, answer_type
-- to the RPC return shapes so the loader could hydrate them on the in-memory
-- GeneratedQuestion. image_url and source_url landed; answer_type ended up
-- acknowledged with `void row.answer_type` in the loader because the
-- DifficultyFactors type required non-partial shape, so reconstructing just
-- answer_type wasn't worth the type escape hatches.
--
-- Dead payload: every draw_board call was returning 7 × answer_type bytes
-- per row for no consumer. game.service.ts:peekAnswer already has a direct
-- DB fallback, so the RPC pass-through isn't needed.
--
-- This migration restores the 7-column return shape (drops answer_type),
-- matching the actual hydration contract.

DROP FUNCTION IF EXISTS public.draw_board(text[], uuid[]);
CREATE OR REPLACE FUNCTION public.draw_board(p_exclude_ids text[] DEFAULT NULL::text[], p_user_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(id uuid, category text, difficulty text, question jsonb, translations jsonb, image_url text, source_url text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  _drawn_ids  uuid[] := ARRAY[]::uuid[];
  _slot       RECORD;
  _q          RECORD;
BEGIN
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
      SELECT qp.id, qp.question, qp.image_url, qp.source_url,
             COALESCE(qp.translations, '{}'::jsonb) AS translations
      FROM question_pool qp
      WHERE qp.used = false
        AND qp.category = _slot.cat
        AND _slot.diff = ANY(COALESCE(qp.allowed_difficulties, ARRAY[qp.difficulty]))
        AND NOT (qp.id = ANY(_drawn_ids))
        AND (p_exclude_ids IS NULL OR cardinality(p_exclude_ids) = 0
             OR NOT (qp.id::text = ANY(p_exclude_ids)))
        AND (
          p_user_ids IS NULL
          OR cardinality(p_user_ids) = 0
          OR NOT EXISTS (
            SELECT 1 FROM user_question_history uqh
            WHERE uqh.user_id = ANY(p_user_ids)
              AND uqh.question_id = qp.id
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
      image_url    := _q.image_url;
      source_url   := _q.source_url;
      RETURN NEXT;
    END LOOP;
  END LOOP;

  UPDATE question_pool
  SET used          = true,
      used_at       = now(),
      times_shown   = times_shown + 1,
      last_shown_at = now()
  WHERE question_pool.id = ANY(_drawn_ids);

  IF p_user_ids IS NOT NULL AND cardinality(p_user_ids) > 0 AND cardinality(_drawn_ids) > 0 THEN
    INSERT INTO user_question_history (user_id, question_id, seen_at)
    SELECT uid, d_id, now()
    FROM UNNEST(_drawn_ids) AS d_id
    CROSS JOIN UNNEST(p_user_ids) AS uid
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN QUERY
  SELECT
    nq.id,
    'NEWS'::text                            AS category,
    'MEDIUM'::text                          AS difficulty,
    nq.question,
    COALESCE(nq.translations, '{}'::jsonb) AS translations,
    NULL::text                              AS image_url,
    NULL::text                              AS source_url
  FROM news_questions nq
  WHERE nq.expires_at > now()
    AND (p_exclude_ids IS NULL OR cardinality(p_exclude_ids) = 0
         OR NOT (nq.id::text = ANY(p_exclude_ids)))
  ORDER BY random()
  LIMIT 2;
END;
$function$;

DROP FUNCTION IF EXISTS public.draw_questions(text, text, integer, text[], integer);
CREATE OR REPLACE FUNCTION public.draw_questions(p_category text, p_difficulty text, p_count integer DEFAULT 1, p_exclude_ids text[] DEFAULT NULL::text[], p_max_elo integer DEFAULT NULL::integer)
 RETURNS TABLE(id uuid, category text, difficulty text, question jsonb, translations jsonb, image_url text, source_url text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH drawn AS (
    SELECT qp.id, qp.category, qp.question, qp.image_url, qp.source_url,
           COALESCE(qp.translations, '{}'::jsonb) AS translations
    FROM question_pool qp
    WHERE qp.used = false
      AND qp.category = p_category
      AND p_difficulty = ANY(COALESCE(qp.allowed_difficulties, ARRAY[qp.difficulty]))
      AND (p_max_elo IS NULL OR qp.question_elo IS NULL OR qp.question_elo <= p_max_elo)
      AND (p_exclude_ids IS NULL OR cardinality(p_exclude_ids) = 0 OR NOT (qp.id::text = ANY(p_exclude_ids)))
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
  SELECT d.id, d.category::text, p_difficulty, d.question, d.translations,
         d.image_url, d.source_url FROM drawn d;
END;
$function$;

DROP FUNCTION IF EXISTS public.draw_logo_questions_by_elo(integer, integer, integer, text[]);
CREATE OR REPLACE FUNCTION public.draw_logo_questions_by_elo(p_target_elo integer, p_range integer DEFAULT 200, p_count integer DEFAULT 1, p_exclude_ids text[] DEFAULT NULL::text[])
 RETURNS TABLE(id uuid, category text, difficulty text, question jsonb, translations jsonb, question_elo integer, image_url text, source_url text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH drawn AS (
    SELECT qp.id, qp.category, qp.difficulty, qp.question,
           COALESCE(qp.translations, '{}'::jsonb) AS translations,
           qp.question_elo, qp.image_url, qp.source_url
    FROM question_pool qp
    WHERE qp.used = false
      AND qp.category = 'LOGO_QUIZ'
      AND qp.question_elo IS NOT NULL
      AND qp.question_elo BETWEEN (p_target_elo - p_range) AND (p_target_elo + p_range)
      AND (p_exclude_ids IS NULL OR cardinality(p_exclude_ids) = 0
           OR NOT (qp.id::text = ANY(p_exclude_ids)))
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
  SELECT d.id, d.category::text, d.difficulty::text, d.question, d.translations,
         d.question_elo, d.image_url, d.source_url
  FROM drawn d;
END;
$function$;

DROP FUNCTION IF EXISTS public.draw_logo_questions_by_elo(integer, integer, integer, text[], integer);
CREATE OR REPLACE FUNCTION public.draw_logo_questions_by_elo(p_target_elo integer, p_range integer DEFAULT 200, p_count integer DEFAULT 1, p_exclude_ids text[] DEFAULT NULL::text[], p_max_elo integer DEFAULT NULL::integer)
 RETURNS TABLE(id uuid, category text, difficulty text, question jsonb, translations jsonb, question_elo integer, image_url text, source_url text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH drawn AS (
    SELECT qp.id, qp.category, qp.difficulty, qp.question,
           COALESCE(qp.translations, '{}'::jsonb) AS translations,
           qp.question_elo, qp.image_url, qp.source_url
    FROM question_pool qp
    WHERE qp.used = false
      AND qp.category = 'LOGO_QUIZ'
      AND qp.question_elo IS NOT NULL
      AND qp.question_elo BETWEEN (p_target_elo - p_range) AND (p_target_elo + p_range)
      AND (p_max_elo IS NULL OR qp.question_elo <= p_max_elo)
      AND (p_exclude_ids IS NULL OR cardinality(p_exclude_ids) = 0
           OR NOT (qp.id::text = ANY(p_exclude_ids)))
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
  SELECT d.id, d.category::text, d.difficulty::text, d.question, d.translations,
         d.question_elo, d.image_url, d.source_url
  FROM drawn d;
END;
$function$;
