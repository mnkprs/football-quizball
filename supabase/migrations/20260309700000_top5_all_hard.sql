-- TOP_5 questions are only drawn as HARD in the game (2 slots).
-- Migrate any orphaned TOP_5/EASY and TOP_5/MEDIUM rows to HARD so they can be played.

UPDATE question_pool
SET difficulty = 'HARD'
WHERE category = 'TOP_5' AND difficulty IN ('EASY', 'MEDIUM');
