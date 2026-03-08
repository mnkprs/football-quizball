-- Function: return_questions_to_pool
-- Marks pool rows as unused (used=false) for the given question IDs.
-- Used when a game ends prematurely so unanswered questions can appear in future matches.
-- Only affects rows that are currently used=true.

CREATE OR REPLACE FUNCTION return_questions_to_pool(p_question_ids text[])
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE question_pool
  SET used = false
  WHERE used = true
    AND (question->>'id') = ANY(p_question_ids);

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;
