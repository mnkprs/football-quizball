-- C10: atomic increment for profiles.logo_quiz_correct.
--
-- The previous JS implementation in SupabaseService.incrementLogoQuizCorrect
-- was a textbook read-modify-write race:
--   1. SELECT logo_quiz_correct  → 5
--   2. JS computes 5 + 1         = 6
--   3. UPDATE SET ... = 6
-- Two concurrent correct answers from the same user (rapid taps, retries,
-- background app coming back online with queued submits) both read 5 and both
-- write 6 — losing one of the increments. Result: the user's logo_quiz_correct
-- counter slowly drifts below the truth, breaking achievement triggers and
-- profile stats.
--
-- Fix: SQL function with a single atomic UPDATE ... = col + 1 RETURNING col.
-- Mirrors the pattern of increment_question_stats from earlier migrations.

CREATE OR REPLACE FUNCTION increment_logo_quiz_correct(
  p_user_id uuid
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_new_count integer;
BEGIN
  UPDATE profiles
  SET logo_quiz_correct = COALESCE(logo_quiz_correct, 0) + 1
  WHERE id = p_user_id
  RETURNING logo_quiz_correct INTO v_new_count;

  IF v_new_count IS NULL THEN
    RAISE EXCEPTION 'Profile not found for user %', p_user_id USING ERRCODE = 'P0002';
  END IF;

  RETURN v_new_count;
END;
$$;

COMMENT ON FUNCTION increment_logo_quiz_correct(uuid) IS
  'Atomic +1 to profiles.logo_quiz_correct. Returns the new count. Replaces a JS read-modify-write that could lose increments under concurrent submits.';
