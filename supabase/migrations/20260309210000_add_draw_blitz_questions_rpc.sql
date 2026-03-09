-- RPC to draw random blitz-eligible questions from pool
-- Eligible: HISTORY, GEOGRAPHY, GOSSIP categories; EASY or MEDIUM difficulty
CREATE OR REPLACE FUNCTION draw_blitz_questions(p_count int DEFAULT 50)
RETURNS TABLE(id uuid, category text, difficulty text, question jsonb)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT id, category, difficulty, question
  FROM question_pool
  WHERE category IN ('HISTORY', 'GEOGRAPHY', 'GOSSIP')
    AND difficulty IN ('EASY', 'MEDIUM')
  ORDER BY random()
  LIMIT p_count;
$$;
