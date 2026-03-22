-- RPC to atomically increment stats on a dummy_user (bot) after a game.
CREATE OR REPLACE FUNCTION increment_dummy_user_stats(
  p_id        uuid,
  p_questions int,
  p_correct   int
) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE dummy_users
  SET
    games_played       = games_played + 1,
    questions_answered = questions_answered + p_questions,
    correct_answers    = correct_answers + p_correct
  WHERE id = p_id;
$$;
