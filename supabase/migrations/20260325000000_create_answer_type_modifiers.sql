-- Create answer_type_modifiers table for DB-backed difficulty modifiers.
-- Replaces hardcoded ANSWER_TYPE_MODIFIERS; allows LLM-extracted answer types.

CREATE TABLE answer_type_modifiers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_type     text NOT NULL UNIQUE,
  modifier        double precision NOT NULL DEFAULT 0,
  category        text,
  source          text NOT NULL DEFAULT 'seed',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_answer_type_modifiers_answer_type ON answer_type_modifiers (answer_type);
COMMENT ON TABLE answer_type_modifiers IS 'Difficulty modifiers per recall target. Positive = harder, negative = easier.';

-- Seed with current hardcoded values
INSERT INTO answer_type_modifiers (answer_type, modifier, source) VALUES
  ('country', -0.05, 'seed'),
  ('team', -0.03, 'seed'),
  ('name', 0, 'seed'),
  ('year', 0.05, 'seed'),
  ('number', 0.07, 'seed'),
  ('score', 0.09, 'seed');
