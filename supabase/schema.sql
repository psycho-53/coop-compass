-- Run in Supabase -> SQL Editor. Required before cloud profiles can save.
-- Public anon/publishable key is safe in client-side config; service_role is never safe.
create table if not exists public.player_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default 'Игрок'
    check (char_length(nickname) between 1 and 40),
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.player_profiles enable row level security;
drop policy if exists "Select only own player profile" on public.player_profiles;
create policy "Select only own player profile" on public.player_profiles
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Insert only own player profile" on public.player_profiles;
create policy "Insert only own player profile" on public.player_profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Update only own player profile" on public.player_profiles;
create policy "Update only own player profile" on public.player_profiles
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
-- Never grant access to anonymous visitors; accounts are private by default.
