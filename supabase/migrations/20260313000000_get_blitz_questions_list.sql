-- RPC: get_blitz_questions_list
-- Returns blitz questions for listing/inspection.
-- Used by list-blitz-questions edge function.

CREATE OR REPLACE FUNCTION get_blitz_questions_list()
RETURNS TABLE (
  category text,
  difficulty_score smallint,
  question_text text,
  answer text,
  created_at timestamptz,
  id uuid
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    qp.category,
    qp.difficulty_score,
    qp.question->>'question_text' AS question_text,
    qp.question->>'correct_answer' AS answer,
    qp.created_at,
    qp.id
  FROM blitz_question_pool qp
  ORDER BY qp.created_at DESC, qp.category, qp.difficulty_score, qp.id;
$$;
