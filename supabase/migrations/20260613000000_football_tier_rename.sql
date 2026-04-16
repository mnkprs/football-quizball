-- Rename ELO ladder from metal tiers to football-native tiers.
-- Old: Iron → Bronze → Silver → Gold → Platinum → Diamond → Challenger
-- New: Sunday League → Academy → Substitute → Pro → Starting XI → Ballon d'Or → GOAT
--
-- Only achievement display names, descriptions, and icons change here.
-- Achievement IDs (elo_750, elo_1000, …) are unchanged — user_achievements rows are untouched.

-- New tier achievements (inserted in 20260604000001 as Bronze/Silver/Gold/Platinum/Challenger)
UPDATE achievements SET name = 'Academy Tier',     description = 'Reach Academy tier (750 ELO)',       icon = '🎒' WHERE id = 'elo_750';
UPDATE achievements SET name = 'Substitute Tier',  description = 'Reach Substitute tier (1000 ELO)',   icon = '🪑' WHERE id = 'elo_1000';
UPDATE achievements SET name = 'Pro Tier',         description = 'Reach Pro tier (1300 ELO)',          icon = '⚽' WHERE id = 'elo_1300';
UPDATE achievements SET name = 'Starting XI Tier', description = 'Reach Starting XI tier (1650 ELO)',  icon = '🎽' WHERE id = 'elo_1650';
UPDATE achievements SET name = 'GOAT Tier',        description = 'Reach GOAT tier (2400 ELO)',         icon = '🐐' WHERE id = 'elo_2400';

-- Legacy thresholds (pre-redesign) — keep the IDs but realign names to the new ladder
UPDATE achievements SET name = 'Substitute II',  description = 'Reach 1200 ELO', icon = '🪑' WHERE id = 'elo_1200';
UPDATE achievements SET name = 'Pro II',         description = 'Reach 1400 ELO', icon = '⚽' WHERE id = 'elo_1400';
UPDATE achievements SET name = 'Pro III',        description = 'Reach 1600 ELO', icon = '⚽' WHERE id = 'elo_1600';
UPDATE achievements SET name = 'Starting XI II', description = 'Reach 1800 ELO', icon = '🎽' WHERE id = 'elo_1800';
UPDATE achievements SET name = "Ballon d'Or",    description = "Reach Ballon d'Or tier (2000 ELO)", icon = '🥇' WHERE id = 'elo_2000';
