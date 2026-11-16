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

-- topics: `topic` now holds the CED topic code (e.g. '5.4'); past-paper membership for the Mock exams tab
alter table public.ap_practice add column if not exists papers text[] not null default '{}';
alter table public.ap_practice add column if not exists paper_numbers jsonb not null default '{}'::jsonb;
create index if not exists ap_practice_topic on public.ap_practice (topic);
create index if not exists ap_practice_papers on public.ap_practice using gin (papers);
