CREATE TABLE achievements (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  icon text,
  category text,
  condition_type text,
  condition_value jsonb
);

CREATE TABLE user_achievements (
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  achievement_id text REFERENCES achievements(id),
  earned_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON user_achievements FOR SELECT USING (true);

INSERT INTO achievements VALUES
  ('first_solo_win','First Victory','Win your first Solo question','🏆','milestone','games_count','{"mode":"solo","min":1}'),
  ('solo_10_games','Solo Veteran','Play 10 Solo sessions','🎮','milestone','games_count','{"mode":"solo","min":10}'),
  ('solo_50_games','Solo Elite','Play 50 Solo sessions','⚡','milestone','games_count','{"mode":"solo","min":50}'),
  ('accuracy_80','Sharp Shooter','Reach 80% accuracy in Solo','🎯','performance','accuracy','{"mode":"solo","min":80}'),
  ('blitz_50','Blitz Runner','Score 50 in Blitz','💨','mode','mode_score','{"mode":"blitz","min":50}'),
  ('blitz_100','Blitz Master','Score 100 in Blitz','🔥','mode','mode_score','{"mode":"blitz","min":100}'),
  ('mayhem_master','Mayhem Master','Complete 10 Mayhem sessions','🌪️','mode','games_count','{"mode":"mayhem","min":10}'),
  ('elo_1200','Silver Ranked','Reach 1200 ELO','🥈','rank','elo_threshold','{"min":1200}'),
  ('elo_1400','Gold Ranked','Reach 1400 ELO','🥇','rank','elo_threshold','{"min":1400}'),
  ('elo_1600','Platinum Ranked','Reach 1600 ELO','💎','rank','elo_threshold','{"min":1600}'),
  ('elo_1800','Diamond Ranked','Reach 1800 ELO','👑','rank','elo_threshold','{"min":1800}'),
  ('match_winner','Match Champion','Win a 2-player match','🏅','milestone','match_wins','{"min":1}'),
  ('match_10_wins','Tournament Regular','Win 10 2-player matches','🏟️','milestone','match_wins','{"min":10}');
