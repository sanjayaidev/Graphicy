-- ClientPM / Ledger — Supabase schema
-- All tables prefixed with ga_ (kept lowercase: Postgres folds unquoted
-- identifiers to lowercase, so "GA_Clients" would actually just become
-- ga_clients and require double-quoting on every query to keep the caps —
-- not worth it. Run this once in the Supabase SQL editor.

create extension if not exists "pgcrypto"; -- for gen_random_uuid()

-- ── Clients ────────────────────────────────────────────────────────────
create table if not exists ga_clients (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  number         text,
  country        text,
  platform       text,
  type           text,               -- Warm / Cold / Old / New
  service        text,
  business       text,
  action         text,               -- "next action" free text
  chance         int,                -- 0–100
  payment_status text default 'Pending',
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── Tasks ──────────────────────────────────────────────────────────────
create table if not exists ga_tasks (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references ga_clients(id) on delete cascade,
  description text not null,
  due_date    date,
  status      text not null default 'Pending', -- Pending / Done
  created_at  timestamptz not null default now()
);

-- ── Payments ───────────────────────────────────────────────────────────
create table if not exists ga_payments (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references ga_clients(id) on delete cascade,
  amount     numeric not null default 0,
  date       timestamptz not null default now(),
  status     text not null default 'Paid', -- Paid / Pending / Overdue
  method     text,
  notes      text,
  created_at timestamptz not null default now()
);

-- ── Activity history ──────────────────────────────────────────────────
create table if not exists ga_history (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references ga_clients(id) on delete cascade,
  action     text not null,     -- "Client created", "Task added", ...
  timestamp  timestamptz not null default now(),
  details    text
);

create index if not exists ga_tasks_client_id_idx    on ga_tasks(client_id);
create index if not exists ga_payments_client_id_idx on ga_payments(client_id);
create index if not exists ga_history_client_id_idx  on ga_history(client_id);

-- ── Row Level Security ────────────────────────────────────────────────
-- The Node backend talks to Supabase with the SERVICE ROLE key (server-side
-- only, never shipped to the browser), which bypasses RLS entirely. Enabling
-- RLS with no policies just means the anon/public key (if ever exposed)
-- can't touch these tables at all — a safety net, not something the app
-- depends on for its own access.
alter table ga_clients  enable row level security;
alter table ga_tasks    enable row level security;
alter table ga_payments enable row level security;
alter table ga_history  enable row level security;
