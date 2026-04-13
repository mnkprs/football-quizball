-- XP / Level achievements (added after XP system launch)

INSERT INTO achievements VALUES
  ('level_5','Rookie','Reach level 5','🌱','progression','level_threshold','{"min":5}'),
  ('level_10','Regular','Reach level 10','🎖️','progression','level_threshold','{"min":10}'),
  ('level_25','Dedicated','Reach level 25','🏵️','progression','level_threshold','{"min":25}'),
  ('level_50','Veteran','Reach level 50','🎗️','progression','level_threshold','{"min":50}'),
  ('level_100','Legend','Reach level 100','♾️','progression','level_threshold','{"min":100}'),
  ('xp_1000','Grinder','Earn 1,000 total XP','⚙️','progression','xp_threshold','{"min":1000}'),
  ('xp_10000','XP Hunter','Earn 10,000 total XP','💼','progression','xp_threshold','{"min":10000}'),
  ('xp_50000','XP Master','Earn 50,000 total XP','💰','progression','xp_threshold','{"min":50000}'),
  ('streak_bonus_15','Combo King','Hit a 15-answer streak and max the streak bonus','🎇','performance','streak','{"min":15}')
ON CONFLICT (id) DO NOTHING;
