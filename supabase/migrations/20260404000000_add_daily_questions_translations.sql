-- Add translations column to daily_questions table
-- Stores per-question Greek translations as a JSONB array
-- Format: [{ "el": { "question_text": "...", "explanation": "..." } }, ...]
-- Index matches the questions array (same order, same length)
ALTER TABLE daily_questions
  ADD COLUMN IF NOT EXISTS translations jsonb DEFAULT '[]'::jsonb;
