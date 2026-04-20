-- Phase 2C: unify question id semantics across question_pool / user_question_history / draw RPCs.
--
-- Problem: 2206 LOGO_QUIZ rows have `question_pool.id != (question->>'id')::uuid`.
-- Root cause: the LOGO_QUIZ seed scripts (backend/scripts/seed-logo-questions.ts
-- and friends) insert `question: { id: uuid(), ... }` without setting a top-level
-- `id`, so Postgres auto-generates a second, different uuid. The app-facing ids
-- (used by draw exclude_ids, user_question_history) were then the jsonb id,
-- while the pool row id was an internal-only value.
--
-- After Phase 2A the loader explicitly sets `question.id = row.id` (pool row id)
-- on every hydrated GeneratedQuestion. Every caller of recordBoardHistory /
-- return_questions_to_pool now passes pool row ids. This migration unifies the
-- historical data to match.
--
-- Steps (executed atomically where possible):
--   1. Snapshot the id remapping into `_phase2c_id_remapping` (kept for 30 days).
--   2. Migrate 36 user_question_history rows from jsonb id → pool id.
--   3. Rewrite draw_board, draw_questions, draw_logo_questions_by_elo (both
--      overloads) to use `qp.id` directly for exclude_ids and for
--      user_question_history inserts, removing all `qp.question->>'id'` probes.
--   4. Simplify return_questions_to_pool (drop the dual-id check).
--   5. Install a trigger that strips jsonb.id / .category / .difficulty / .points
--      on INSERT or UPDATE, so legacy scripts can't reintroduce the divergence.
--
-- Not done here (saved for 2D): bulk UPDATE stripping the legacy jsonb dupes
-- on existing rows.
--
-- Safety rationale:
--   - elo_history already keys on pool id (logo-quiz.service passes data.id) —
--     verified zero rows reference jsonb id. No elo migration needed.
--   - 0 uqh rows already use pool id for divergent LOGO_QUIZ rows — no collision
--     when we overwrite.
--   - In-flight user sessions that cached jsonb ids will see their
--     session.drawnQuestionIds stop matching once draw RPCs switch to qp.id,
--     creating a one-time "previously-seen logo shown again" glitch per user.
--     Acceptable — sessions are short-lived.

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1: Snapshot remapping (keep table for 30 days in case of rollback)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS _phase2c_id_remapping AS
SELECT
  id                       AS pool_id,
  (question->>'id')::uuid  AS old_jsonb_id,
  category,
  now()                    AS snapshot_at
FROM question_pool
WHERE question ? 'id' AND (question->>'id')::uuid != id;

COMMENT ON TABLE _phase2c_id_remapping IS
  'Phase 2C rollback snapshot. Drop after 2026-05-20 if 2C proves stable.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2: Migrate user_question_history from jsonb id → pool id for divergent rows
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE user_question_history uqh
SET question_id = r.pool_id
FROM _phase2c_id_remapping r
WHERE uqh.question_id = r.old_jsonb_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3: Rewrite draw RPCs to use qp.id (not qp.question->>'id')
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
    COALESCE(nq.translations, '{}'::jsonb) AS translations
  FROM news_questions nq
  WHERE nq.expires_at > now()
    AND (p_exclude_ids IS NULL OR cardinality(p_exclude_ids) = 0
         OR NOT (nq.id::text = ANY(p_exclude_ids)))
  ORDER BY random()
  LIMIT 2;
END;
$function$;

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
  SELECT d.id, d.category::text, p_difficulty, d.question, d.translations FROM drawn d;
END;
$function$;

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
  SELECT d.id, d.category::text, d.difficulty::text, d.question, d.translations, d.question_elo
  FROM drawn d;
END;
$function$;

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
  SELECT d.id, d.category::text, d.difficulty::text, d.question, d.translations, d.question_elo
  FROM drawn d;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 4: Simplify return_questions_to_pool (drop dual-id check)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.return_questions_to_pool(p_question_ids text[])
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  updated_count integer;
BEGIN
  UPDATE question_pool
  SET used = false, used_at = NULL
  WHERE used = true
    AND id::text = ANY(p_question_ids);

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 5: Trigger to strip jsonb duplicates on INSERT or UPDATE
-- Prevents legacy LOGO_QUIZ seed scripts from reintroducing divergence.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_question_jsonb_shape()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Strip fields that duplicate top-level columns.
  -- id, category, difficulty are always on top-level; points is derivable.
  -- difficulty_factors was a generation-time scoring signal — its fields are
  -- now promoted (specificity_score, combo_score) or replaced (popularity_score).
  IF NEW.question IS NOT NULL THEN
    NEW.question := NEW.question
      - 'id' - 'category' - 'difficulty' - 'points'
      - 'difficulty_factors';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS question_pool_enforce_jsonb_shape ON question_pool;
CREATE TRIGGER question_pool_enforce_jsonb_shape
BEFORE INSERT OR UPDATE OF question ON question_pool
FOR EACH ROW EXECUTE FUNCTION public.enforce_question_jsonb_shape();
