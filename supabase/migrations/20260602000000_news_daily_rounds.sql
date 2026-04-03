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
  last_round_id       uuid REFERENCES news_rounds(id) ON DELETE SET NULL,
  total_rounds_played int NOT NULL DEFAULT 0,
  total_correct       int NOT NULL DEFAULT 0,
  total_answered      int NOT NULL DEFAULT 0,
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE user_news_streaks ENABLE ROW LEVEL SECURITY;
-- Backend writes via service_role key, so SELECT-only policy for client reads
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_news_streaks' AND policyname = 'own rows') THEN
    CREATE POLICY "own rows" ON user_news_streaks FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- 3. Add round_id to news_questions
ALTER TABLE news_questions ADD COLUMN IF NOT EXISTS round_id uuid REFERENCES news_rounds(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_news_questions_round_id ON news_questions (round_id);

-- 4. Change expires_at default from 7 days to 24 hours
ALTER TABLE news_questions ALTER COLUMN expires_at SET DEFAULT (now() + interval '24 hours');

-- 5. Add correct column to user_news_progress + unique constraint for duplicate prevention
ALTER TABLE user_news_progress ADD COLUMN IF NOT EXISTS correct boolean;
-- Prevent duplicate answers via unique constraint (TOCTOU race fix)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_news_progress_user_question_unique') THEN
    ALTER TABLE user_news_progress ADD CONSTRAINT user_news_progress_user_question_unique UNIQUE (user_id, question_id);
  END IF;
END $$;

-- 6. Update expire_news_questions to also clean up old rounds
CREATE OR REPLACE FUNCTION expire_news_questions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Delete expired news questions (CASCADE deletes user_news_progress rows)
  DELETE FROM news_questions WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  -- Delete rounds with no remaining questions (cleanup)
  -- news_questions.round_id ON DELETE CASCADE means we only need to check empty rounds
  DELETE FROM news_rounds r
  WHERE r.expires_at < now()
    AND NOT EXISTS (SELECT 1 FROM news_questions nq WHERE nq.round_id = r.id);

  RETURN deleted_count;
END;
$$;

-- 7. Atomic profile stat increment RPC (avoids read-modify-write race)
CREATE OR REPLACE FUNCTION increment_news_stats(p_user_id uuid, p_correct int)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE profiles SET
    questions_answered = questions_answered + 1,
    correct_answers = correct_answers + p_correct
  WHERE id = p_user_id;
$$;

-- 8. Atomic mode stats upsert RPC
CREATE OR REPLACE FUNCTION upsert_news_mode_stats(p_user_id uuid, p_correct int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO user_mode_stats (user_id, mode, questions_answered, correct_answers, games_played, updated_at)
  VALUES (p_user_id, 'news', 1, p_correct, 0, now())
  ON CONFLICT (user_id, mode)
  DO UPDATE SET
    questions_answered = user_mode_stats.questions_answered + 1,
    correct_answers = user_mode_stats.correct_answers + EXCLUDED.correct_answers,
    updated_at = now();
END;
$$;

-- 9. Clean slate: delete old queue-based questions and their progress rows
-- ON DELETE CASCADE on user_news_progress.question_id handles progress cleanup automatically
DELETE FROM news_questions WHERE round_id IS NULL;
