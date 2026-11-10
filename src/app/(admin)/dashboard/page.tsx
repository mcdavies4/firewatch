import Link from "next/link";
import { db } from "@/lib/supabase";
import { STATUS_STYLE, worstStatus, ago } from "@/lib/ui";
import AutoRefresh from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

type Shop = {
  id: string;
  shop_number: string;
  owner_name: string;
  section_id: string | null;
  sensors: { status: string; last_seen_at: string | null; battery_pct: number | null }[];
};

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ market?: string }> }) {
  const { market: marketParam } = await searchParams;
  const supa = db();

  const { data: markets } = await supa.from("markets").select("id, name, city").eq("kind", "market").order("name");
  if (!markets?.length) {
    return (
      <p>
        No markets yet. <Link className="underline" href="/setup">Add one in Setup</Link>, or go to{" "}
        <Link className="underline" href="/homes">Homes</Link>.
      </p>
    );
  }
  const market = markets.find((m) => m.id === marketParam) ?? markets[0];

  const [{ data: sections }, { data: shops }, { data: alerts }] = await Promise.all([
    supa.from("sections").select("id, name").eq("market_id", market.id).order("name"),
    supa
      .from("shops")
      .select("id, shop_number, owner_name, section_id, sensors(status, last_seen_at, battery_pct)")
      .eq("market_id", market.id)
      .order("shop_number"),
    supa
      .from("alerts")
      .select("id, status, created_at, acknowledged_by, current_tier, shops(shop_number, owner_name), sections(name)")
      .eq("market_id", market.id)
      .in("status", ["open", "acknowledged"])
      .order("created_at", { ascending: false }),
  ]);

  const allShops = (shops ?? []) as unknown as Shop[];
  const allSensors = allShops.flatMap((s) => s.sensors);
  const count = (st: string) => allSensors.filter((x) => x.status === st).length;

  const groups = [
    ...(sections ?? []).map((sec) => ({ name: sec.name, shops: allShops.filter((s) => s.section_id === sec.id) })),
    { name: "No section", shops: allShops.filter((s) => !s.section_id) },
  ].filter((g) => g.shops.length);

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={10} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">
          {market.name} <span className="text-base font-normal text-zinc-500">{market.city}</span>
        </h1>
        {markets.length > 1 && (
          <div className="flex gap-2 text-sm">
            {markets.map((m) => (
              <Link
                key={m.id}
                href={`/dashboard?market=${m.id}`}
                className={`rounded px-2 py-1 ${m.id === market.id ? "bg-zinc-900 text-white" : "bg-zinc-200"}`}
              >
                {m.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      {(alerts ?? []).map((a) => {
        const al = a as unknown as {
          id: string;
          status: string;
          created_at: string;
          acknowledged_by: string | null;
          current_tier: number;
          shops: { shop_number: string; owner_name: string } | null;
          sections: { name: string } | null;
        };
        return (
          <Link
            key={al.id}
            href={`/alerts/${al.id}`}
            className={`block rounded-lg p-4 text-white ${al.status === "open" ? "bg-red-600 animate-pulse" : "bg-orange-500"}`}
          >
            <div className="text-lg font-bold">
              🔥 {al.status === "open" ? "FIRE ALARM — NOT YET ACKNOWLEDGED" : `RESPONDING: ${al.acknowledged_by}`}
            </div>
            <div>
              Shop {al.shops?.shop_number} ({al.shops?.owner_name}) · {al.sections?.name ?? ""} · started{" "}
              {ago(al.created_at)} · escalation tier {al.current_tier}
            </div>
          </Link>
        );
      })}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["Sensors", allSensors.length, "bg-white"],
          ["OK", count("ok"), "bg-emerald-50"],
          ["Alarm", count("alarm"), "bg-red-50"],
          ["Offline", count("offline"), "bg-zinc-100"],
          ["Low battery", count("low_battery"), "bg-amber-50"],
        ].map(([label, n, bg]) => (
          <div key={label as string} className={`rounded-lg border p-3 ${bg}`}>
            <div className="text-2xl font-bold">{n}</div>
            <div className="text-sm text-zinc-600">{label}</div>
          </div>
        ))}
      </div>

      {groups.map((g) => (
        <section key={g.name}>
          <h2 className="mb-2 font-semibold">{g.name}</h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-8">
            {g.shops.map((shop) => {
              const st = worstStatus(shop.sensors.map((x) => x.status));
              const style = STATUS_STYLE[st] ?? STATUS_STYLE.none;
              const lastSeen = shop.sensors
                .map((x) => x.last_seen_at)
                .filter(Boolean)
                .sort()
                .pop();
              return (
                <Link
                  key={shop.id}
                  href={`/shops/${shop.id}`}
                  className={`rounded-md p-2 text-xs ${style.tile}`}
                  title={`${shop.owner_name} — last seen ${ago(lastSeen ?? null)}`}
                >
                  <div className="text-sm font-bold">{shop.shop_number}</div>
                  <div className="truncate">{style.label}</div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
