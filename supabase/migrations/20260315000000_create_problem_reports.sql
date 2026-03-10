-- problem_reports: store user-reported question issues (replaces mailto flow)
create table if not exists problem_reports (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null,
  game_id uuid,
  category text not null,
  difficulty text not null,
  points integer not null,
  question_text text not null,
  fifty_fifty_applicable boolean default false,
  image_url text,
  meta jsonb,
  created_at timestamptz default now() not null
);

-- RLS: backend (service_role) bypasses RLS; anon has no access by default
alter table problem_reports enable row level security;
