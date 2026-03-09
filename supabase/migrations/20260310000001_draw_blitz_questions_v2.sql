CREATE OR REPLACE FUNCTION draw_blitz_questions_v2(
  p_count int DEFAULT 50
)
RETURNS TABLE (id uuid, category text, difficulty_score smallint, question jsonb)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT id, category, difficulty_score, question
  FROM blitz_question_pool
  WHERE category IN ('HISTORY', 'GEOGRAPHY', 'GOSSIP', 'PLAYER_ID')
  ORDER BY random()
  LIMIT p_count;
$$;
