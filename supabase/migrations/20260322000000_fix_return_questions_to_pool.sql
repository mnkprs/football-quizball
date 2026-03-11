-- Fix return_questions_to_pool: match on both row id and question->>'id' for reliable reset.
-- Ensures used=false, used_at=NULL when returning questions after game end.

CREATE OR REPLACE FUNCTION return_questions_to_pool(p_question_ids text[])
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE question_pool
  SET used = false, used_at = NULL
  WHERE used = true
    AND (
      id::text = ANY(p_question_ids)
      OR (question->>'id') = ANY(p_question_ids)
    );

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;
