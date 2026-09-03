-- supabase/add_client_image.sql
-- Adds a photo field to clients, hosted on ImgBB (see lib/imgbb.js).
-- Run this once in the Supabase SQL editor if your ga_clients table
-- predates this change.

alter table ga_clients add column if not exists image_url text;
