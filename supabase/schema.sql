create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  username text not null unique,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  details text,
  category text,
  kind text not null check (kind in ('daily', 'habit', 'upcoming')),
  task_date date,
  due_date date,
  target_per_week integer,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;

create policy "profiles are viewable by owner"
on public.profiles
for select
using (auth.uid() = id);

create policy "profiles are insertable by owner"
on public.profiles
for insert
with check (auth.uid() = id);

create policy "profiles are updateable by owner"
on public.profiles
for update
using (auth.uid() = id);

create policy "tasks are viewable by owner"
on public.tasks
for select
using (auth.uid() = user_id);

create policy "tasks are insertable by owner"
on public.tasks
for insert
with check (auth.uid() = user_id);

create policy "tasks are updateable by owner"
on public.tasks
for update
using (auth.uid() = user_id);

create policy "tasks are deletable by owner"
on public.tasks
for delete
using (auth.uid() = user_id);
