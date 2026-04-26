-- C8: make commit_solo_answer LOUD on CAS conflict.
--
-- Original commit_solo_answer (20260318100000, extended in 20260611000001) did:
--   UPDATE profiles SET elo = p_elo_after WHERE id = p_user_id AND elo = p_elo_before;
--   INSERT INTO elo_history (...) VALUES (...);
--
-- When the CAS predicate (elo = p_elo_before) fails — because a concurrent solo
-- answer updated the user's ELO between the read and the commit — the UPDATE
-- silently affects 0 rows, BUT the INSERT into elo_history still runs. Result:
--   • No ELO change (correct).
--   • A bogus elo_history row claiming a change that never happened (BUG).
-- The caller (`SupabaseService.commitSoloAnswer`) sees `error: null` and no
-- amount of log scraping reveals the corruption — silent CAS losses pile up
-- as orphan history rows that drive bogus analytics and confuse the user's
-- elo-history graph.
--
-- Fix matches the pattern already used by commit_logo_quiz_answer
-- (20260611000001 line 45-47): RAISE EXCEPTION between the UPDATE and INSERT
-- so a CAS loss propagates to the caller, which can log + retry.

CREATE OR REPLACE FUNCTION commit_solo_answer(
  p_user_id     uuid,
  p_elo_before  int,
  p_elo_after   int,
  p_elo_change  int,
  p_difficulty  text,
  p_correct     boolean,
  p_timed_out   boolean,
  p_question_id uuid DEFAULT NULL,
  p_mode        text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE profiles
  SET elo = p_elo_after
  WHERE id = p_user_id AND elo = p_elo_before;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ELO conflict — retry' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO elo_history (user_id, elo_before, elo_after, elo_change, question_difficulty, correct, timed_out, question_id, mode)
  VALUES (p_user_id, p_elo_before, p_elo_after, p_elo_change, p_difficulty, p_correct, p_timed_out, p_question_id, p_mode);
END;
$$;
