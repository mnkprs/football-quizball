-- News Daily Rounds: switch from 7-day personal queues to daily shared rounds.
-- 1 round/day, 10 questions, daily streaks.

-- 1. Create news_rounds table
CREATE TABLE IF NOT EXISTS news_rounds (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  question_count  int         NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_news_rounds_expires_at ON news_rounds (expires_at);

-- 2. Create user_news_streaks table
CREATE TABLE IF NOT EXISTS user_news_streaks (
  user_id             uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  current_streak      int NOT NULL DEFAULT 0,
  max_streak          int NOT NULL DEFAULT 0,
  last_round_id       uuid REFERENCES news_rounds(id),
  total_rounds_played int NOT NULL DEFAULT 0,
  total_correct       int NOT NULL DEFAULT 0,
  total_answered      int NOT NULL DEFAULT 0,
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE user_news_streaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own rows" ON user_news_streaks FOR SELECT USING (auth.uid() = user_id);

-- 3. Add round_id to news_questions
ALTER TABLE news_questions ADD COLUMN IF NOT EXISTS round_id uuid REFERENCES news_rounds(id);
CREATE INDEX IF NOT EXISTS idx_news_questions_round_id ON news_questions (round_id);

-- 4. Change expires_at default from 7 days to 24 hours
ALTER TABLE news_questions ALTER COLUMN expires_at SET DEFAULT (now() + interval '24 hours');

-- 5. Add correct column to user_news_progress
ALTER TABLE user_news_progress ADD COLUMN IF NOT EXISTS correct boolean;

-- 6. Update expire_news_questions to also clean up old rounds
CREATE OR REPLACE FUNCTION expire_news_questions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Delete expired news questions
  DELETE FROM news_questions WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  -- Delete rounds with no remaining questions (cleanup)
  DELETE FROM news_rounds r
  WHERE r.expires_at < now()
    AND NOT EXISTS (SELECT 1 FROM news_questions nq WHERE nq.round_id = r.id);

  RETURN deleted_count;
END;
$$;

-- 7. Expire all existing news questions (clean slate for new round system)
-- Old questions were on 7-day TTL with no round_id. They won't work with the new system.
UPDATE news_questions SET expires_at = now() - interval '1 second'
WHERE round_id IS NULL;

-- 8. Clean up orphaned user_news_progress rows
DELETE FROM user_news_progress
WHERE question_id IN (
  SELECT id FROM news_questions WHERE round_id IS NULL
);
