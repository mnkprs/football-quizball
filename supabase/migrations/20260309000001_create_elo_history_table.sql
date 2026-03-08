-- elo_history: audit log of every ELO change
create table if not exists elo_history (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  elo_before integer not null,
  elo_after integer not null,
  elo_change integer not null,
  question_difficulty text not null,
  correct boolean not null,
  timed_out boolean not null,
  created_at timestamptz default now() not null
);

create index if not exists elo_history_user_id_idx on elo_history(user_id);
create index if not exists elo_history_created_at_idx on elo_history(created_at desc);
