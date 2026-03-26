-- Logo Quiz — Add LOGO_QUIZ category support + logo_quiz_elo on profiles

-- Add logo_quiz_elo to profiles (separate ELO track)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS logo_quiz_elo integer DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS logo_quiz_games_played integer DEFAULT 0;

-- RPC: commit a logo quiz answer (atomic ELO update + history insert)
CREATE OR REPLACE FUNCTION commit_logo_quiz_answer(
  p_user_id uuid,
  p_elo_before int,
  p_elo_after int,
  p_elo_change int,
  p_difficulty text,
  p_correct boolean,
  p_timed_out boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Optimistic lock: only update if ELO hasn't changed since we read it
  UPDATE profiles
  SET logo_quiz_elo = p_elo_after
  WHERE id = p_user_id
    AND logo_quiz_elo = p_elo_before;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ELO conflict — retry';
  END IF;

  -- Insert history row
  INSERT INTO elo_history (user_id, elo_before, elo_after, elo_change, question_difficulty, correct, timed_out)
  VALUES (p_user_id, p_elo_before, p_elo_after, p_elo_change, p_difficulty, p_correct, p_timed_out);
END;
$$;
