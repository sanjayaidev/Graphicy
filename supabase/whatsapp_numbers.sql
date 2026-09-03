-- ClientPM — WhatsApp number filter
-- Lets the WhatsApp tab (public/whatsapp.html) show only chats for numbers
-- you've explicitly added, instead of every chat GoWA knows about. Empty
-- table = no filter applied (all chats shown), same as before this
-- migration. Run this once in the Supabase SQL editor (also folded into
-- schema.sql so a fresh install only needs that one file).

create table if not exists ga_whatsapp_numbers (
  id         uuid primary key default gen_random_uuid(),
  number     text not null,        -- digits only, e.g. "14155551234" (matched against the JID)
  label      text,                 -- optional friendly note, e.g. "Jane — main client"
  created_at timestamptz not null default now()
);

-- One row per number: re-adding the same number updates the label instead
-- of creating a duplicate filter entry.
create unique index if not exists ga_whatsapp_numbers_number_idx
  on ga_whatsapp_numbers (number);

alter table ga_whatsapp_numbers enable row level security;
