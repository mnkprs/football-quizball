-- Generic RPC to increment questions_answered and correct_answers on profiles
-- without bumping games_played. Used by logo quiz, duel, battle royale, blitz, mayhem.
CREATE OR REPLACE FUNCTION increment_question_stats(p_user_id uuid, p_questions int, p_correct int)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE profiles SET
    questions_answered = questions_answered + p_questions,
    correct_answers = correct_answers + p_correct
  WHERE id = p_user_id;
$$;
