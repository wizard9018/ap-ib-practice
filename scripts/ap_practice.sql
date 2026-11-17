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

-- figures: {"p": [image urls shown under the question], "c": {"A": image url for that choice}}
alter table public.ap_practice add column if not exists figures jsonb;

-- per-user progress of the AP practice (done marks and wrong questions redone with changed numbers); each user reads and writes only their own rows
create table if not exists public.ap_progress (
  user_id uuid not null references auth.users on delete cascade,
  question_id text not null,
  mark text,                        -- '1' seen, 'c' correct, 'w' wrong, 'p' partial
  redo boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id)
);
alter table public.ap_progress enable row level security;
drop policy if exists "ap_progress own" on public.ap_progress;
create policy "ap_progress own" on public.ap_progress for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- number-changed versions of multiple-choice questions, shown when the original was answered wrongly (read-only for everyone; written with the service role key)
create table if not exists public.ap_variants (
  base_id text primary key references public.ap_practice(id) on delete cascade,
  prompt text not null,
  choices jsonb not null default '[]',
  answer text not null,
  figures jsonb
);
alter table public.ap_variants enable row level security;
drop policy if exists "ap_variants read" on public.ap_variants;
create policy "ap_variants read" on public.ap_variants for select using (true);
