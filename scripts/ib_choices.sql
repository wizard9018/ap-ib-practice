-- Run once in the Supabase SQL Editor. Multiple-choice versions of IB written-answer questions (one row per sub-part).
create table if not exists public.ib_choices (
  ref text not null,
  part text not null,
  subject_slug text not null,
  stem text not null,
  options jsonb not null,           -- {"A": "...", "B": "...", "C": "...", "D": "..."}
  correct text not null check (correct in ('A','B','C','D')),
  check_note text,                  -- 'ok' or the reviewer's remark
  created_at timestamptz not null default now(),
  primary key (ref, part)
);
alter table public.ib_choices enable row level security;
drop policy if exists "ib_choices readable" on public.ib_choices;
create policy "ib_choices readable" on public.ib_choices for select using (true);
-- writes only through the service role (no insert/update/delete policy)
