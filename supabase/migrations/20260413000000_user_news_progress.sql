CREATE TABLE user_news_progress (
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  question_id  uuid NOT NULL REFERENCES news_questions(id) ON DELETE CASCADE,
  assigned_at  timestamptz NOT NULL DEFAULT now(),
  answered_at  timestamptz,
  PRIMARY KEY (user_id, question_id)
);
CREATE INDEX idx_user_news_progress_user ON user_news_progress(user_id);
ALTER TABLE user_news_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own rows" ON user_news_progress FOR ALL USING (auth.uid() = user_id);
