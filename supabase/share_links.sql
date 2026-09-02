-- Client share links — secure, revocable, expirable, read-only links a
-- solo operator can hand a client so they can check their own task/payment
-- status without asking. Run once in the Supabase SQL editor (safe to run
-- even if you already ran the full schema.sql — this file is idempotent).
--
-- Design notes:
--   - The raw token is a 32-byte random value, returned to the caller ONCE
--     at creation time and never stored. Only sha256(token) is kept
--     ("token_hash"), so a database leak alone does not hand out working
--     links.
--   - Every link is scoped to exactly one client via client_id — the
--     public endpoint that serves data can never return another client's
--     data, regardless of what's requested.
--   - Links are revocable (revoked_at) and optionally expirable
--     (expires_at). The public endpoint is read-only by construction: no
--     route exists to mutate anything using a share token.

create table if not exists ga_share_links (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references ga_clients(id) on delete cascade,
  token_hash        text not null unique,
  token_prefix      text not null,     -- first 8 chars, shown in the UI to tell links apart
  label             text,              -- optional note, e.g. "Sent via WhatsApp Jun 2026"
  expires_at        timestamptz,
  revoked_at        timestamptz,
  last_accessed_at  timestamptz,
  access_count      int not null default 0,
  created_at        timestamptz not null default now()
);

create index if not exists ga_share_links_client_id_idx on ga_share_links(client_id);
create index if not exists ga_share_links_token_hash_idx on ga_share_links(token_hash);

alter table ga_share_links enable row level security;
