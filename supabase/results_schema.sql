-- BioSync results storage for Supabase Auth users.
create table if not exists public.biosync_results (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  test_type text not null check (test_type in ('hearing', 'respiratory', 'motor', 'eye')),
  created_at timestamptz not null default timezone('utc', now()),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists biosync_results_user_type_created_idx
  on public.biosync_results (user_id, test_type, created_at desc);

alter table public.biosync_results enable row level security;

-- Users can read only their own results.
create policy "Users can read own results"
  on public.biosync_results
  for select
  using (auth.uid() = user_id);

-- Users can insert only rows for themselves.
create policy "Users can insert own results"
  on public.biosync_results
  for insert
  with check (auth.uid() = user_id);

-- Users can update only their own results.
create policy "Users can update own results"
  on public.biosync_results
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Optional maintenance policy.
create policy "Users can delete own results"
  on public.biosync_results
  for delete
  using (auth.uid() = user_id);
