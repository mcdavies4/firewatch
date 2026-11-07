-- Demo data for local testing. Sensor EUIs match scripts/simulate.ts defaults.
-- Replace phone numbers with your own before testing real calls.

with m as (
  insert into markets (name, city, state) values ('Demo Market', 'Lagos', 'Lagos') returning id
), s as (
  insert into sections (market_id, name)
  select id, unnest(array['Line A', 'Line B']) from m returning id, name, market_id
), shops_ins as (
  insert into shops (market_id, section_id, shop_number, owner_name, owner_phone, trade)
  select s.market_id, s.id, x.num, x.owner, x.phone, x.trade
  from s
  join (values
    ('Line A', 'A1', 'Mrs Okafor', '+2348000000001', 'fabrics'),
    ('Line A', 'A2', 'Mr Bello',   '+2348000000002', 'electronics'),
    ('Line B', 'B1', 'Mr Adeyemi', '+2348000000003', 'shoes')
  ) as x(section, num, owner, phone, trade) on x.section = s.name
  returning id, shop_number
), c as (
  insert into contacts (market_id, section_id, name, phone, role, tier)
  select m.id, null, x.name, x.phone, x.role::contact_role, x.tier
  from m, (values
    ('Night Security Desk', '+2348000000010', 'security', 0),
    ('Market Fire Marshal', '+2348000000011', 'marshal', 1),
    ('Union Chairman',      '+2348000000012', 'union', 1),
    ('Fire Service Station','+2348000000013', 'fire_service', 2),
    ('Field Technician',    '+2348000000014', 'technician', 3)
  ) as x(name, phone, role, tier)
  returning id
)
insert into sensors (dev_eui, shop_id, kind, label, status)
select x.eui, shops_ins.id, 'smoke_heat', 'Shop ' || shops_ins.shop_number, 'ok'
from shops_ins
join (values
  ('A1', '70B3D57ED0000001'),
  ('A2', '70B3D57ED0000002'),
  ('B1', '70B3D57ED0000003')
) as x(num, eui) on x.num = shops_ins.shop_number;
