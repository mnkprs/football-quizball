-- Add new ELO tier achievements (750, 1000, 1300, 1650, 2400)
-- Existing achievements (1200, 1400, 1600, 1800, 2000) are kept for backwards compat

INSERT INTO achievements (id, name, description, icon, category, condition_type, condition_value)
VALUES
  ('elo_750',  'Bronze Tier',      'Reach 750 ELO',        '🥉', 'rank', 'elo_threshold', '{"min":750}'),
  ('elo_1000', 'Iron Tier',        'Reach 1000 ELO',       '⚙️', 'rank', 'elo_threshold', '{"min":1000}'),
  ('elo_1300', 'Gold Tier',        'Reach 1300 ELO',       '🥇', 'rank', 'elo_threshold', '{"min":1300}'),
  ('elo_1650', 'Platinum Tier',    'Reach 1650 ELO',       '💎', 'rank', 'elo_threshold', '{"min":1650}'),
  ('elo_2400', 'Challenger Tier',  'Reach 2400 ELO',       '🏆', 'rank', 'elo_threshold', '{"min":2400}')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  condition_value = EXCLUDED.condition_value;

-- Update existing achievements to reflect new tier system names
UPDATE achievements SET name = 'Silver Tier', description = 'Reach 1200 ELO' WHERE id = 'elo_1200';
UPDATE achievements SET name = 'Gold+ Tier', description = 'Reach 1400 ELO' WHERE id = 'elo_1400';
UPDATE achievements SET name = 'Platinum+ Tier', description = 'Reach 1600 ELO' WHERE id = 'elo_1600';
UPDATE achievements SET name = 'Diamond Tier', description = 'Reach 1800 ELO' WHERE id = 'elo_1800';
UPDATE achievements SET name = 'Grandmaster Tier', description = 'Reach 2000 ELO' WHERE id = 'elo_2000';
