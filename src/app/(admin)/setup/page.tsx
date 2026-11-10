import { db } from "@/lib/supabase";
import { ago, STATUS_STYLE } from "@/lib/ui";
import { assignSensor, createContact, createMarket, createSection, createShop, toggleContact } from "@/app/actions";

export const dynamic = "force-dynamic";

const input = "w-full rounded border p-2 text-sm";
const btn = "rounded bg-zinc-900 px-3 py-2 text-sm font-semibold text-white";
const card = "space-y-2 rounded-lg border bg-white p-4";

export default async function Setup() {
  const supa = db();
  const [{ data: markets }, { data: sections }, { data: shops }, { data: contacts }, { data: sensors }] =
    await Promise.all([
      supa.from("markets").select("id, name").eq("kind", "market").order("name"),
      supa.from("sections").select("id, name, market_id").order("name"),
      supa.from("shops").select("id, shop_number, owner_name, market_id").order("shop_number"),
      supa.from("contacts").select("*").order("tier"),
      supa.from("sensors").select("id, dev_eui, status, label, last_seen_at, battery_pct, shop_id, shops(shop_number)").order("created_at", { ascending: false }),
    ]);

  const marketName = (id: string) => markets?.find((m) => m.id === id)?.name ?? "";
  const isMarket = (id: string) => !!markets?.some((m) => m.id === id);
  const MarketSelect = () => (
    <select name="market_id" required className={input}>
      {(markets ?? []).map((m) => (
        <option key={m.id} value={m.id}>{m.name}</option>
      ))}
    </select>
  );
  const SectionSelect = ({ optional }: { optional?: boolean }) => (
    <select name="section_id" className={input}>
      <option value="">{optional ? "Whole market" : "No section"}</option>
      {(sections ?? []).map((s) => (
        <option key={s.id} value={s.id}>{marketName(s.market_id)} — {s.name}</option>
      ))}
    </select>
  );

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Setup</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <form action={createMarket} className={card}>
          <h2 className="font-semibold">1. Add market</h2>
          <input name="name" required placeholder="Market name" className={input} />
          <input name="city" required placeholder="City" className={input} />
          <input name="state" placeholder="State" className={input} />
          <button className={btn}>Add market</button>
        </form>

        <form action={createSection} className={card}>
          <h2 className="font-semibold">2. Add section / line</h2>
          <MarketSelect />
          <input name="name" required placeholder="e.g. Line C" className={input} />
          <button className={btn}>Add section</button>
        </form>

        <form action={createShop} className={card}>
          <h2 className="font-semibold">3. Register shop</h2>
          <MarketSelect />
          <SectionSelect />
          <input name="shop_number" required placeholder="Shop number, e.g. C14" className={input} />
          <input name="owner_name" required placeholder="Owner name" className={input} />
          <input name="owner_phone" required placeholder="Owner phone (0803… or +234…)" className={input} />
          <input name="backup_phone" placeholder="Backup phone (optional)" className={input} />
          <input name="trade" placeholder="Trade, e.g. fabrics" className={input} />
          <input name="nipost_postcode" placeholder="NIPOST postcode (optional)" className={input} />
          <button className={btn}>Register shop</button>
        </form>

        <form action={assignSensor} className={card}>
          <h2 className="font-semibold">4. Assign sensor to shop</h2>
          <input name="dev_eui" required placeholder="DevEUI (16 hex chars, on the sensor label)" className={`${input} font-mono`} />
          <select name="shop_id" className={input}>
            <option value="">— Not installed yet —</option>
            {(shops ?? []).filter((s) => isMarket(s.market_id)).map((s) => (
              <option key={s.id} value={s.id}>{marketName(s.market_id)} — {s.shop_number} ({s.owner_name})</option>
            ))}
          </select>
          <select name="kind" className={input}>
            <option value="smoke">Smoke</option>
            <option value="heat">Heat</option>
            <option value="smoke_heat">Smoke + heat</option>
          </select>
          <input name="label" placeholder="Label (optional)" className={input} />
          <button className={btn}>Save sensor</button>
        </form>

        <form action={createContact} className={`${card} md:col-span-2`}>
          <h2 className="font-semibold">5. Add responder</h2>
          <p className="text-sm text-zinc-600">
            Tier 0 is called immediately with the shop owner. Each higher tier is called if nobody has pressed 1 within
            the escalation window. Technicians only get offline-sensor messages.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <MarketSelect />
            <SectionSelect optional />
            <input name="name" required placeholder="Name" className={input} />
            <input name="phone" required placeholder="Phone" className={input} />
            <select name="role" className={input}>
              <option value="security">Night security</option>
              <option value="marshal">Fire marshal</option>
              <option value="union">Union official</option>
              <option value="fire_service">Fire service</option>
              <option value="technician">Technician</option>
            </select>
            <select name="tier" className={input}>
              {[0, 1, 2, 3].map((t) => (
                <option key={t} value={t}>Tier {t}</option>
              ))}
            </select>
          </div>
          <button className={btn}>Add responder</button>
        </form>
      </div>

      <section>
        <h2 className="mb-2 font-semibold">Responders</h2>
        <table className="w-full rounded-lg bg-white text-sm shadow-sm">
          <tbody>
            {(contacts ?? []).filter((c) => isMarket(c.market_id)).map((c) => (
              <tr key={c.id} className={`border-t ${c.active ? "" : "opacity-40"}`}>
                <td className="p-2">Tier {c.tier}</td>
                <td className="p-2">{c.name}</td>
                <td className="p-2">{c.phone}</td>
                <td className="p-2">{c.role}</td>
                <td className="p-2">{marketName(c.market_id)}</td>
                <td className="p-2 text-right">
                  <form action={toggleContact}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="active" value={String(!c.active)} />
                    <button className="text-xs underline">{c.active ? "Disable" : "Enable"}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Sensors</h2>
        <p className="mb-2 text-sm text-zinc-600">Unknown sensors that send data appear here as “Unassigned”.</p>
        <table className="w-full rounded-lg bg-white text-sm shadow-sm">
          <tbody>
            {(sensors ?? []).map((s) => {
              const st = STATUS_STYLE[s.status] ?? STATUS_STYLE.unassigned;
              const shop = (s as unknown as { shops: { shop_number: string } | null }).shops;
              return (
                <tr key={s.id} className="border-t">
                  <td className="p-2 font-mono">{s.dev_eui}</td>
                  <td className="p-2">
                    <span className={`mr-2 inline-block h-2 w-2 rounded-full ${st.dot}`} />
                    {st.label}
                  </td>
                  <td className="p-2">{shop ? `Shop ${shop.shop_number}` : "—"}</td>
                  <td className="p-2">{s.battery_pct ?? "?"}%</td>
                  <td className="p-2">seen {ago(s.last_seen_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
