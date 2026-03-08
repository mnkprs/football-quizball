-- Blitz mode scores table
CREATE TABLE IF NOT EXISTS blitz_scores (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  username text NOT NULL,
  score int NOT NULL DEFAULT 0,
  total_answered int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Index for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_blitz_scores_user_score ON blitz_scores(user_id, score DESC);

-- RLS: users can only read their own scores; service role inserts
ALTER TABLE blitz_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own blitz scores"
  ON blitz_scores FOR SELECT
  USING (auth.uid() = user_id);

-- Leaderboard: best score per user, sorted by score DESC
CREATE OR REPLACE FUNCTION get_blitz_leaderboard(p_limit int DEFAULT 20)
RETURNS TABLE(user_id uuid, username text, score int, total_answered int, created_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT b.user_id, b.username, b.score, b.total_answered, b.created_at
  FROM (
    SELECT DISTINCT ON (user_id) user_id, username, score, total_answered, created_at
    FROM blitz_scores
    ORDER BY user_id, score DESC
  ) b
  ORDER BY b.score DESC
  LIMIT p_limit;
$$;
