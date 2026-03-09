-- Add 20 more dummy users
INSERT INTO dummy_users (username, elo, games_played, questions_answered, correct_answers) VALUES
  ('ChristosChampion', 1320, 55, 220, 178),
  ('GeorgiaGoal', 1285, 48, 195, 156),
  ('StavrosStriker', 1250, 45, 182, 145),
  ('IoannaInsight', 1215, 40, 168, 132),
  ('ManolisMaster', 1180, 36, 148, 115),
  ('FotiniForward', 1145, 32, 130, 98),
  ('AndreasAce', 1110, 29, 116, 85),
  ('VasilikiVeteran', 1085, 26, 104, 72),
  ('GiorgosGenius', 1060, 23, 92, 62),
  ('DespinaDynamo', 1035, 20, 80, 52),
  ('KonstantinosKing', 1010, 17, 68, 45),
  ('TheodoraThunder', 985, 14, 56, 38),
  ('MichalisMaverick', 960, 12, 48, 32),
  ('ParaskeviPro', 935, 10, 40, 26),
  ('StefanosStar', 910, 9, 36, 22),
  ('ChrysaChampion', 885, 7, 28, 18),
  ('PanagiotisPlayer', 860, 6, 24, 15),
  ('ZoeZealous', 835, 5, 20, 12),
  ('LefterisLegend', 810, 4, 16, 10),
  ('OlympiaOnFire', 785, 3, 12, 7)
ON CONFLICT (username) DO NOTHING;
