-- NIPOST postcode verification results, for homes (markets.kind = 'home') and market shops.
-- Run in the Supabase SQL editor after 002_home.sql. Safe to run more than once.

alter table markets add column if not exists postcode_status text;
alter table markets add column if not exists postcode_state text;
alter table markets add column if not exists postcode_lga text;
alter table markets add column if not exists postcode_locality text;
alter table markets add column if not exists postcode_note text;
alter table markets add column if not exists postcode_checked_at timestamptz;

alter table shops add column if not exists postcode_status text;
alter table shops add column if not exists postcode_state text;
alter table shops add column if not exists postcode_lga text;
alter table shops add column if not exists postcode_locality text;
alter table shops add column if not exists postcode_note text;
alter table shops add column if not exists postcode_checked_at timestamptz;
