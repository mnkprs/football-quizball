-- Move blitz high score to profiles: one row per user instead of write-heavy blitz_scores array.
-- Only the maximum score matters; non-high-score sessions are irrelevant.

-- Add columns to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS max_blitz_score int DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS max_blitz_total_answered int DEFAULT 0 NOT NULL;

-- Backfill from blitz_scores (best score per user)
UPDATE profiles p
SET
  max_blitz_score = COALESCE(b.best_score, 0),
  max_blitz_total_answered = COALESCE(b.best_total, 0)
FROM (
  SELECT user_id, score AS best_score, total_answered AS best_total
  FROM (
    SELECT user_id, score, total_answered,
      ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY score DESC) AS rn
    FROM blitz_scores
  ) t
  WHERE rn = 1
) b
WHERE p.id = b.user_id;

-- Add to dummy_users for leaderboard consistency (they have 0 by default)
ALTER TABLE dummy_users
  ADD COLUMN IF NOT EXISTS max_blitz_score int DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS max_blitz_total_answered int DEFAULT 0 NOT NULL;

-- New leaderboard: read from profiles + dummy_users (drop first: return type changed)
DROP FUNCTION IF EXISTS get_blitz_leaderboard(int);

CREATE OR REPLACE FUNCTION get_blitz_leaderboard(p_limit int DEFAULT 10)
RETURNS TABLE(user_id uuid, username text, score int, total_answered int)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM (
    SELECT id AS user_id, username, max_blitz_score AS score, max_blitz_total_answered AS total_answered
    FROM profiles WHERE max_blitz_score > 0
    UNION ALL
    SELECT id AS user_id, username, max_blitz_score AS score, max_blitz_total_answered AS total_answered
    FROM dummy_users WHERE max_blitz_score > 0
  ) t
  ORDER BY score DESC
  LIMIT p_limit;
$$;

-- New blitz rank: count profiles + dummy_users with higher max_blitz_score
CREATE OR REPLACE FUNCTION get_blitz_rank(p_user_id uuid)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::int + 1
  FROM (
    SELECT 1 FROM profiles WHERE max_blitz_score > COALESCE((SELECT max_blitz_score FROM profiles WHERE id = p_user_id), 0)
    UNION ALL
    SELECT 1 FROM dummy_users WHERE max_blitz_score > COALESCE((SELECT max_blitz_score FROM profiles WHERE id = p_user_id), 0)
  ) t;
$$;

-- Drop old blitz_scores table
DROP TABLE IF EXISTS blitz_scores;
