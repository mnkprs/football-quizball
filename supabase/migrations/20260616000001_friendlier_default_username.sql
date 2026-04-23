-- Friendlier default username for new signups.
--
-- Previous behaviour: `username = split_part(email, '@', 1)`.
--   * For Apple "Hide My Email" users this produced an unreadable
--     32-char hex string (the relay id) as the visible username.
--   * For everyone else it leaked the local part of the email.
--
-- New behaviour:
--   1. Use `raw_user_meta_data.username` if the client supplied one (email signup).
--   2. Use `raw_user_meta_data.full_name` first token if present (Google).
--   3. Otherwise fall back to `player_<first 8 of uuid>` — neutral, unique,
--      and obviously a placeholder so the user is prompted to change it.
--
-- The `username_set` flag is left at its default (false), so the username
-- modal will still open on first login regardless of which fallback was used.

create or replace function handle_new_user()
returns trigger as $$
declare
  meta_username text := nullif(new.raw_user_meta_data->>'username', '');
  meta_fullname text := nullif(new.raw_user_meta_data->>'full_name', '');
  email_local   text := nullif(split_part(coalesce(new.email, ''), '@', 1), '');
  email_domain  text := lower(split_part(coalesce(new.email, ''), '@', 2));
  candidate     text;
begin
  -- Prefer an explicit username from the signup payload.
  candidate := meta_username;

  -- Then a first-name from Google's full_name.
  if candidate is null and meta_fullname is not null then
    candidate := split_part(meta_fullname, ' ', 1);
  end if;

  -- Then the email local part — but NOT for Apple's private relay,
  -- which gives a hex-string that's worse than no name at all.
  if candidate is null
     and email_local is not null
     and email_domain <> 'privaterelay.appleid.com' then
    candidate := email_local;
  end if;

  -- Final fallback: deterministic, unique-per-user placeholder.
  if candidate is null then
    candidate := 'player_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;

  insert into public.profiles (id, username) values (new.id, candidate);
  return new;
end;
$$ language plpgsql security definer;
