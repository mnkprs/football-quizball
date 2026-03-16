CREATE TABLE user_mode_stats (
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  mode text NOT NULL,
  current_elo int DEFAULT 1000,
  max_elo int DEFAULT 1000,
  best_session_score int DEFAULT 0,
  games_played int DEFAULT 0,
  questions_answered int DEFAULT 0,
  correct_answers int DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, mode)
);
ALTER TABLE user_mode_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON user_mode_stats FOR SELECT USING (true);
CREATE POLICY "Service role write" ON user_mode_stats USING (false) WITH CHECK (false);
