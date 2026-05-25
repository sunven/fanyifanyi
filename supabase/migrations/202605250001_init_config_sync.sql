drop table if exists public.user_config_blobs;
drop table if exists public.user_ai_configs;

create table public.user_ai_configs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  schema_version integer not null,
  revision text not null,
  updated_at timestamptz not null,
  device_id text not null,
  plaintext jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.user_ai_configs enable row level security;

create policy "users can read own config"
on public.user_ai_configs
for select
using (auth.uid() = user_id);

create policy "users can insert own config"
on public.user_ai_configs
for insert
with check (auth.uid() = user_id);

create policy "users can update own config"
on public.user_ai_configs
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

notify pgrst, 'reload schema';
