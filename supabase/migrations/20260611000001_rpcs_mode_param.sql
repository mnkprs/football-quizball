-- Extend all three ELO-writing RPCs to accept p_mode so elo_history rows can be
-- filtered per ELO track (solo | logo_quiz | logo_quiz_hardcore). Backward-compatible:
-- p_mode defaults to NULL, so existing callers keep working and write NULL mode rows.

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

  INSERT INTO elo_history (user_id, elo_before, elo_after, elo_change, question_difficulty, correct, timed_out, question_id, mode)
  VALUES (p_user_id, p_elo_before, p_elo_after, p_elo_change, p_difficulty, p_correct, p_timed_out, p_question_id, p_mode);
END;
$$;

CREATE OR REPLACE FUNCTION commit_logo_quiz_answer(
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
  SET logo_quiz_elo = p_elo_after,
      logo_quiz_games_played = logo_quiz_games_played + 1
  WHERE id = p_user_id
    AND logo_quiz_elo = p_elo_before;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ELO conflict — retry';
  END IF;

  INSERT INTO elo_history (user_id, elo_before, elo_after, elo_change, question_difficulty, correct, timed_out, question_id, mode)
  VALUES (p_user_id, p_elo_before, p_elo_after, p_elo_change, p_difficulty, p_correct, p_timed_out, p_question_id, p_mode);
END;
$$;

CREATE OR REPLACE FUNCTION commit_logo_quiz_hardcore_answer(
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
  SET logo_quiz_hardcore_elo = p_elo_after,
      logo_quiz_hardcore_games_played = logo_quiz_hardcore_games_played + 1
  WHERE id = p_user_id
    AND logo_quiz_hardcore_elo = p_elo_before;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ELO conflict — retry';
  END IF;

  INSERT INTO elo_history (user_id, elo_before, elo_after, elo_change, question_difficulty, correct, timed_out, question_id, mode)
  VALUES (p_user_id, p_elo_before, p_elo_after, p_elo_change, p_difficulty, p_correct, p_timed_out, p_question_id, p_mode);
END;
$$;
