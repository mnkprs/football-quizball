-- Simple key-value settings table for app configuration that must survive restarts
create table if not exists app_settings (
  key   text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

-- Seed the bot pause setting (active by default)
insert into app_settings (key, value) values ('bots_paused', 'false')
on conflict (key) do nothing;
