-- Enable RLS on profiles
alter table profiles enable row level security;

-- profiles: readable by everyone (for leaderboard)
drop policy if exists "profiles_public_read" on profiles;
create policy "profiles_public_read" on profiles
  for select using (true);

-- profiles: users can update their own profile
drop policy if exists "profiles_own_update" on profiles;
create policy "profiles_own_update" on profiles
  for update using (auth.uid() = id);

-- Enable RLS on elo_history
alter table elo_history enable row level security;

-- elo_history: users can read their own history
drop policy if exists "elo_history_own_read" on elo_history;
create policy "elo_history_own_read" on elo_history
  for select using (auth.uid() = user_id);

-- elo_history: service role can insert (backend uses service role key)
-- No insert policy needed since service role bypasses RLS
