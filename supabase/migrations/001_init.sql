-- Firewatch: market fire detection & response
-- Run in Supabase SQL editor (or `supabase db push`).

create extension if not exists pgcrypto;

-- ---------- Core places ----------
create table markets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  state text,
  created_at timestamptz not null default now()
);

create table sections (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references markets(id) on delete cascade,
  name text not null,                       -- e.g. "Line C", "Block 4"
  created_at timestamptz not null default now(),
  unique (market_id, name)
);

create table shops (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references markets(id) on delete cascade,
  section_id uuid references sections(id) on delete set null,
  shop_number text not null,
  owner_name text not null,
  owner_phone text not null,                -- E.164, e.g. +2348012345678
  backup_phone text,
  trade text,                               -- e.g. "fabrics", "electronics"
  nipost_postcode text,
  created_at timestamptz not null default now(),
  unique (market_id, shop_number)
);

-- People who get escalated to. Tier 0 fires immediately with the shop owner,
-- tier 1 after ESCALATION_SECONDS without acknowledgement, tier 2 after that, etc.
create type contact_role as enum ('security', 'marshal', 'union', 'fire_service', 'technician');

create table contacts (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references markets(id) on delete cascade,
  section_id uuid references sections(id) on delete cascade, -- null = whole market
  name text not null,
  phone text not null,
  role contact_role not null,
  tier int not null default 0 check (tier between 0 and 5),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Devices ----------
create type sensor_status as enum ('unassigned', 'ok', 'alarm', 'offline', 'low_battery', 'tamper');

create table sensors (
  id uuid primary key default gen_random_uuid(),
  dev_eui text not null unique,             -- LoRaWAN device EUI, upper-case hex
  shop_id uuid references shops(id) on delete set null,
  kind text not null default 'smoke',       -- smoke | heat | smoke_heat
  label text,
  status sensor_status not null default 'unassigned',
  battery_pct int,
  temperature_c numeric,
  last_seen_at timestamptz,
  last_gateway text,
  last_rssi int,
  created_at timestamptz not null default now()
);

create table gateways (
  id uuid primary key default gen_random_uuid(),
  gateway_id text not null unique,          -- TTN gateway id or ChirpStack EUI
  market_id uuid references markets(id) on delete set null,
  label text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table sensor_events (
  id bigint generated always as identity primary key,
  sensor_id uuid references sensors(id) on delete cascade,
  dev_eui text not null,
  type text not null,                       -- alarm | alarm_cleared | heartbeat | tamper | test | unknown
  payload jsonb not null,
  received_at timestamptz not null default now()
);
create index on sensor_events (sensor_id, received_at desc);

-- ---------- Alerts ----------
create type alert_status as enum ('open', 'acknowledged', 'resolved', 'false_alarm');

create table alerts (
  id uuid primary key default gen_random_uuid(),
  sensor_id uuid not null references sensors(id) on delete cascade,
  shop_id uuid references shops(id) on delete set null,
  market_id uuid references markets(id) on delete set null,
  section_id uuid references sections(id) on delete set null,
  status alert_status not null default 'open',
  current_tier int not null default 0,
  next_escalation_at timestamptz,
  ack_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  acknowledged_by text,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now()
);
create index on alerts (status, next_escalation_at);
create unique index one_open_alert_per_sensor on alerts (sensor_id) where status in ('open', 'acknowledged');

create table alert_attempts (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references alerts(id) on delete cascade,
  tier int not null,
  contact_name text not null,
  contact_phone text not null,
  role text not null,                       -- owner | security | marshal | ...
  channel text not null,                    -- voice | sms
  provider_ref text,                        -- Africa's Talking sessionId / messageId
  status text not null default 'queued',    -- queued | sent | answered | acknowledged | failed | logged
  detail jsonb,
  created_at timestamptz not null default now()
);
create index on alert_attempts (provider_ref);

-- ---------- Audits & certificates ----------
create table audits (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  auditor_name text not null,
  checklist jsonb not null,                 -- { item_key: boolean }
  score int not null,                       -- 0-100
  passed boolean not null,
  notes text,
  certificate_code text unique,             -- only set when passed
  valid_until date,
  created_at timestamptz not null default now()
);

-- Lock everything down: only the server (service role) talks to these tables.
alter table markets enable row level security;
alter table sections enable row level security;
alter table shops enable row level security;
alter table contacts enable row level security;
alter table sensors enable row level security;
alter table gateways enable row level security;
alter table sensor_events enable row level security;
alter table alerts enable row level security;
alter table alert_attempts enable row level security;
alter table audits enable row level security;
