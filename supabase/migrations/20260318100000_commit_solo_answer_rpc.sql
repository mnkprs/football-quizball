-- Atomically updates ELO and inserts history in one transaction.
-- Uses optimistic lock: only updates profile if elo hasn't changed since we read it.
CREATE OR REPLACE FUNCTION commit_solo_answer(
  p_user_id     uuid,
  p_elo_before  int,
  p_elo_after   int,
  p_elo_change  int,
  p_difficulty  text,
  p_correct     boolean,
  p_timed_out   boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Only update if elo still matches what we read (prevents double-submit race)
  UPDATE profiles
  SET elo = p_elo_after
  WHERE id = p_user_id AND elo = p_elo_before;

  -- Always insert history row regardless of whether elo was updated
  INSERT INTO elo_history (user_id, elo_before, elo_after, elo_change, question_difficulty, correct, timed_out)
  VALUES (p_user_id, p_elo_before, p_elo_after, p_elo_change, p_difficulty, p_correct, p_timed_out);
END;
$$;
