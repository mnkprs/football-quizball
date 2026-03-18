-- Tracks which questions a user has seen in solo mode.
-- Prevents the same question from appearing again within 30 days.
CREATE TABLE IF NOT EXISTS user_question_history (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL,
  seen_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_uqh_user_seen ON user_question_history(user_id, seen_at DESC);

-- RLS: users can only access their own history
ALTER TABLE user_question_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own question history"
  ON user_question_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage question history"
  ON user_question_history FOR ALL
  USING (true)
  WITH CHECK (true);

-- Cleanup function for rows older than 30 days (call via cron or manually)
CREATE OR REPLACE FUNCTION cleanup_old_question_history() RETURNS void
LANGUAGE sql SECURITY DEFINER AS $$
  DELETE FROM user_question_history WHERE seen_at < now() - INTERVAL '30 days';
$$;
