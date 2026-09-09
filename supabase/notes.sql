-- Notes (Notes tab) — see supabase/schema.sql for the mirrored copy that
-- also gets run for a fresh install.
--
-- Freestanding text notes, not tied to any client — a general scratchpad
-- (reminders, ideas, things to follow up on) with a status you can move
-- through as it gets worked on.

create table if not exists ga_notes (
  id         uuid primary key default gen_random_uuid(),
  text       text not null,
  status     text not null default 'Open', -- Open / In Progress / Done
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ga_notes_status_idx     on ga_notes(status);
create index if not exists ga_notes_created_at_idx on ga_notes(created_at);
alter table ga_notes enable row level security;
