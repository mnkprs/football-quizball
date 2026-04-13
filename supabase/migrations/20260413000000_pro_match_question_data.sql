-- Store per-question answers for each battle royale player so pro users
-- can review their answers after the match.
alter table battle_royale_players
  add column if not exists player_answers jsonb not null default '[]';

comment on column battle_royale_players.player_answers is
  'Array of { index, answer, is_correct } objects, appended on each submitAnswer call.';
