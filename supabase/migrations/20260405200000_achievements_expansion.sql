-- ─── New profile columns for progress tracking ───────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS max_correct_streak int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS logo_quiz_correct int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duel_wins int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS br_wins int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_active_date date,
  ADD COLUMN IF NOT EXISTS current_daily_streak int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_questions_all_modes int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS modes_played text[] NOT NULL DEFAULT '{}';

-- ─── New achievements ────────────────────────────────────────

-- EARLY HOOK
INSERT INTO achievements VALUES
  ('first_correct','Quick Learner','Answer your first question correctly','🧠','milestone','total_questions','{"min":1}'),
  ('streak_3','Hat Trick','Get 3 correct answers in a row','⚽','performance','streak','{"min":3}'),
  ('first_duel','Challenger','Complete your first Duel','🤝','milestone','duel_games','{"min":1}'),
  ('first_logo','Badge Spotter','Identify your first logo correctly','🔍','milestone','logo_correct','{"min":1}'),
  ('first_battle_royale','Arena Debut','Join your first Battle Royale','🏟️','milestone','br_games','{"min":1}');

-- MID-GAME
INSERT INTO achievements VALUES
  ('streak_10','On Fire','Get 10 correct answers in a row','🔥','performance','streak','{"min":10}'),
  ('duel_5_wins','Duel Contender','Win 5 Duels','⚔️','milestone','duel_wins','{"min":5}'),
  ('logo_50','Crest Collector','Identify 50 logos correctly','🛡️','mode','logo_correct','{"min":50}'),
  ('all_modes','Explorer','Play every game mode at least once','🗺️','milestone','modes_played','{"min":6}'),
  ('daily_3','Three-a-Day','Play 3 days in a row','📅','consistency','daily_streak','{"min":3}'),
  ('perfect_solo_round','Flawless','Get every question right in a Solo session','💯','performance','perfect_session','{"min":1}'),
  ('blitz_150','Blitz Legend','Score 150 in Blitz','⚡','mode','mode_score','{"mode":"blitz","min":150}'),
  ('accuracy_90','Sniper','Reach 90% accuracy in Solo','🎯','performance','accuracy','{"mode":"solo","min":90}');

-- LONG-TERM CHASE
INSERT INTO achievements VALUES
  ('solo_100_games','Solo Centurion','Play 100 Solo sessions','💪','milestone','games_count','{"mode":"solo","min":100}'),
  ('solo_500_games','Solo Legend','Play 500 Solo sessions','🐐','milestone','games_count','{"mode":"solo","min":500}'),
  ('streak_25','Unstoppable','Get 25 correct answers in a row','🌟','performance','streak','{"min":25}'),
  ('duel_50_wins','Duel Master','Win 50 Duels','🗡️','milestone','duel_wins','{"min":50}'),
  ('duel_100_wins','Duel Legend','Win 100 Duels','👑','milestone','duel_wins','{"min":100}'),
  ('logo_250','Crest Expert','Identify 250 logos correctly','🏅','mode','logo_correct','{"min":250}'),
  ('daily_7','Weekly Warrior','Play 7 days in a row','🗓️','consistency','daily_streak','{"min":7}'),
  ('daily_30','Monthly Devotee','Play 30 days in a row','🏆','consistency','daily_streak','{"min":30}'),
  ('elo_2000','Grandmaster','Reach 2000 ELO','💎','rank','elo_threshold','{"min":2000}'),
  ('match_50_wins','Match Legend','Win 50 matches','🏟️','milestone','match_wins','{"min":50}'),
  ('br_wins_10','Royale Regular','Win 10 Battle Royales','👊','milestone','br_wins','{"min":10}'),
  ('br_wins_50','Battle Royale King','Win 50 Battle Royales','🫅','milestone','br_wins','{"min":50}'),
  ('questions_1000','Trivia Machine','Answer 1000 questions total','🤖','milestone','total_questions','{"min":1000}'),
  ('questions_5000','Living Encyclopedia','Answer 5000 questions total','📚','milestone','total_questions','{"min":5000}');
