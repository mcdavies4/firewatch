-- Firewatch growth features: drills on the impact page, fire stations, panic buttons,
-- per-person alert language, trader self sign-up.
-- Run in the Supabase SQL editor after 004_telegram.sql. Safe to run more than once.

create extension if not exists pgcrypto;

-- Alerts: where they came from, and whether it was a drill (kept out of real-incident stats)
alter table alerts add column if not exists source text not null default 'sensor';   -- sensor | panic
alter table alerts add column if not exists is_drill boolean not null default false;

-- Fire stations, matched to alerts by NIPOST LGA (or state) and called automatically
create table if not exists fire_stations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  state text not null,
  lga text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table fire_stations enable row level security;

-- Panic button link per shop/home, owner's language, self-registered flag
alter table shops add column if not exists panic_token text;
update shops set panic_token = encode(gen_random_bytes(12), 'hex') where panic_token is null;
alter table shops alter column panic_token set default encode(gen_random_bytes(12), 'hex');
create unique index if not exists shops_panic_token on shops (panic_token);
alter table shops add column if not exists owner_language text not null default 'en';
alter table shops add column if not exists self_registered boolean not null default false;

-- Responder language
alter table contacts add column if not exists language text not null default 'en';

-- Market sign-up link for traders
alter table markets add column if not exists join_token text;
update markets set join_token = encode(gen_random_bytes(9), 'hex') where join_token is null;
alter table markets alter column join_token set default encode(gen_random_bytes(9), 'hex');
create unique index if not exists markets_join_token on markets (join_token);
