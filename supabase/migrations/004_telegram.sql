-- Telegram alerts: a phone number linked to a Telegram chat gets every alert that
-- phone would get by SMS, as a Telegram message too (not blocked by DND).
-- Run in the Supabase SQL editor after 003_nipost.sql. Safe to run more than once.

create table if not exists telegram_links (
  phone text primary key,          -- E.164, same format as shops.owner_phone / contacts.phone
  chat_id bigint not null,
  telegram_name text,
  linked_at timestamptz not null default now()
);
alter table telegram_links enable row level security;
