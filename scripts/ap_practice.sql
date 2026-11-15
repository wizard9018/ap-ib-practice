-- AP Calculus unit practice questions (read-only for everyone; rows are written with the service role key)
create table if not exists public.ap_practice (
  id text primary key,
  course text not null,            -- 'ab'
  unit int not null,               -- College Board CED unit 1-10
  kind text not null,              -- 'mc' | 'fr'
  year int,
  number text,
  prompt text not null,
  choices jsonb not null default '[]',
  parts jsonb not null default '[]',
  answer text,                     -- correct letter for mc (null when unknown)
  rubric text,                     -- scoring guideline for fr
  topic text
);
create index if not exists ap_practice_course_unit on public.ap_practice (course, unit);
alter table public.ap_practice enable row level security;
drop policy if exists "ap_practice read" on public.ap_practice;
create policy "ap_practice read" on public.ap_practice for select using (true);
