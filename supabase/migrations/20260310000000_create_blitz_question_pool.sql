CREATE TABLE blitz_question_pool (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  category         text        NOT NULL CHECK (category IN ('HISTORY', 'GEOGRAPHY', 'GOSSIP', 'PLAYER_ID')),
  difficulty_score smallint    NOT NULL CHECK (difficulty_score BETWEEN 1 AND 100),
  question         jsonb       NOT NULL,  -- { question_text, correct_answer }
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX idx_bqp_cat_score ON blitz_question_pool (category, difficulty_score);

ALTER TABLE blitz_question_pool ENABLE ROW LEVEL SECURITY;
-- No direct anon/authenticated access — all access via SECURITY DEFINER RPC
