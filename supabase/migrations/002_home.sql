-- Firewatch Home: a home is a "site" (markets row with kind = 'home') with one
-- household (a shops row with shop_number 'HOME'). That way homes reuse the same
-- sensors, alerts, escalation and acknowledgement as markets.
-- Run in the Supabase SQL editor after 001_init.sql.

alter table markets add column if not exists kind text not null default 'market';
alter table markets drop constraint if exists markets_kind_check;
alter table markets add constraint markets_kind_check check (kind in ('market', 'home'));
alter table markets add column if not exists address text;
alter table markets add column if not exists nipost_postcode text;
alter table markets add column if not exists landmark text;
alter table markets add column if not exists lat double precision;
alter table markets add column if not exists lng double precision;

-- New responder roles for homes.
alter type contact_role add value if not exists 'family';
alter type contact_role add value if not exists 'neighbour';
alter type contact_role add value if not exists 'estate_security';

-- WiFi/GSM devices (ESP32) post straight to /api/device with their own key.
alter table sensors add column if not exists device_key text;
alter table sensors add column if not exists co_ppm numeric;

-- What the alert is about: fire (smoke/heat) or carbon monoxide.
alter table alerts add column if not exists hazard text not null default 'fire';
alter table alerts drop constraint if exists alerts_hazard_check;
alter table alerts add constraint alerts_hazard_check check (hazard in ('fire', 'co'));
