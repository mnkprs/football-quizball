-- Today in Football: one set of questions per calendar day, same for all users.
CREATE TABLE IF NOT EXISTS daily_questions (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  question_date    date        NOT NULL UNIQUE,
  questions        jsonb       NOT NULL,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_questions_date ON daily_questions (question_date);

ALTER TABLE daily_questions ENABLE ROW LEVEL SECURITY;
