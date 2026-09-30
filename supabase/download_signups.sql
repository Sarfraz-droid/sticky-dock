-- Run once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- The landing page inserts directly from the browser with the publishable key,
-- so RLS allows INSERT only. Nobody can read, change or delete rows with that key;
-- view the emails yourself in Table Editor.

create table if not exists public.download_signups (
  id         bigint generated always as identity primary key,
  email      text not null check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'),
  os         text check (os in ('mac', 'win')),
  source     text default 'landing',
  created_at timestamptz not null default now()
);

-- one row per email (the page sends "ignore-duplicates")
create unique index if not exists download_signups_email_key on public.download_signups (lower(email));

alter table public.download_signups enable row level security;

drop policy if exists "anyone can sign up" on public.download_signups;
create policy "anyone can sign up" on public.download_signups
  for insert to anon, authenticated
  with check (true);

grant insert on public.download_signups to anon, authenticated;
