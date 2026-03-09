-- Update draw_blitz_questions_v2 to return translations for Greek support.

DROP FUNCTION IF EXISTS draw_blitz_questions_v2(int);

CREATE OR REPLACE FUNCTION draw_blitz_questions_v2(p_count int DEFAULT 50)
RETURNS TABLE (
  id uuid,
  category text,
  difficulty_score smallint,
  question jsonb,
  translations jsonb
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT id, category, difficulty_score, question, COALESCE(translations, '{}'::jsonb)
  FROM blitz_question_pool
  WHERE category IN ('HISTORY', 'GEOGRAPHY', 'GOSSIP', 'PLAYER_ID')
  ORDER BY random()
  LIMIT p_count;
$$;
