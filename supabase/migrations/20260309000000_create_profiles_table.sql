-- profiles: linked to auth.users via trigger on signup
create table if not exists profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  username text unique not null,
  elo integer default 1000 not null,
  games_played integer default 0 not null,
  questions_answered integer default 0 not null,
  correct_answers integer default 0 not null,
  created_at timestamptz default now() not null
);

-- Auto-create profile on new user signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
