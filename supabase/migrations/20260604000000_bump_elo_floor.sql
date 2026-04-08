-- Bump ELO floor from 100 to 500 for all existing players
-- New tier system: Iron starts at 500, no player should be below floor

-- Solo ELO
UPDATE profiles SET elo = 500 WHERE elo < 500;

-- Logo quiz ELO
UPDATE profiles SET logo_quiz_elo = 500 WHERE logo_quiz_elo < 500;

-- Hardcore logo quiz ELO
UPDATE profiles SET logo_quiz_hardcore_elo = 500 WHERE logo_quiz_hardcore_elo < 500;

-- Mode stats (mayhem etc)
UPDATE user_mode_stats SET current_elo = 500 WHERE current_elo < 500;
