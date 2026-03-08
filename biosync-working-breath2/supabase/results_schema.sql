-- Run this in the Supabase SQL editor.

create table if not exists public.biosync_results (
  id text primary key,
  user_id text not null,
  test_type text not null check (test_type in ('hearing', 'respiratory', 'motor')),
  created_at timestamptz not null,
  payload jsonb not null
);

create index if not exists biosync_results_user_type_created_idx
  on public.biosync_results (user_id, test_type, created_at desc);

alter table public.biosync_results enable row level security;

create policy "Users can read own results"
on public.biosync_results
for select
using (auth.jwt() ->> 'sub' = user_id);

create policy "Users can insert own results"
on public.biosync_results
for insert
with check (auth.jwt() ->> 'sub' = user_id);

create policy "Users can update own results"
on public.biosync_results
for update
using (auth.jwt() ->> 'sub' = user_id)
with check (auth.jwt() ->> 'sub' = user_id);
