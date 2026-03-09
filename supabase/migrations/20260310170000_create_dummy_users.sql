-- Standalone dummy_users table for development/testing and seeding demo data.
-- Not linked to auth.users; use for UI demos, testing leaderboards, etc.

CREATE TABLE IF NOT EXISTS dummy_users (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  username text NOT NULL UNIQUE,
  elo integer DEFAULT 1000 NOT NULL,
  games_played integer DEFAULT 0 NOT NULL,
  questions_answered integer DEFAULT 0 NOT NULL,
  correct_answers integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Seed dummy users with varied stats
INSERT INTO dummy_users (username, elo, games_played, questions_answered, correct_answers) VALUES
  ('AlexTheStriker', 1247, 42, 186, 142),
  ('MariaMidfield', 1189, 38, 152, 118),
  ('NikosGoalkeeper', 1156, 35, 140, 98),
  ('ElenaWinger', 1123, 31, 124, 89),
  ('DimitrisDefender', 1098, 28, 112, 76),
  ('SofiaCaptain', 1072, 25, 98, 65),
  ('YiannisSuperSub', 1045, 22, 86, 54),
  ('KaterinaRookie', 1012, 18, 72, 44),
  ('PetrosVeteran', 987, 15, 60, 38),
  ('AnnaNewcomer', 950, 8, 32, 18)
ON CONFLICT (username) DO NOTHING;
