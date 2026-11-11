import Link from "next/link";
import { db } from "@/lib/supabase";
import { STATUS_STYLE, worstStatus, ago } from "@/lib/ui";
import { createHome } from "@/app/actions";
import AutoRefresh from "@/components/AutoRefresh";
import DbError from "@/components/DbError";
import LangSelect from "@/components/LangSelect";

export const dynamic = "force-dynamic";

const input = "w-full rounded border p-2 text-sm";

type HomeRow = {
  id: string;
  name: string;
  city: string;
  address: string | null;
  nipost_postcode: string | null;
  postcode_status: string | null;
  shops: {
    owner_name: string;
    owner_phone: string;
    sensors: { status: string; last_seen_at: string | null; kind?: string }[];
  }[];
};

export default async function Homes() {
  const supa = db();
  const [{ data, error }, { data: openAlerts }] = await Promise.all([
    supa
      .from("markets")
      .select("id, name, city, address, nipost_postcode, postcode_status, shops(owner_name, owner_phone, sensors(status, last_seen_at, kind))")
      .eq("kind", "home")
      .order("name"),
    supa.from("alerts").select("market_id, hazard").in("status", ["open", "acknowledged"]),
  ]);
  if (error) return <DbError message={error.message} />;
  const homes = (data ?? []) as unknown as HomeRow[];
  const alertFor = (id: string) => openAlerts?.find((a) => a.market_id === id);

  return (
    <div className="space-y-8">
      <AutoRefresh seconds={10} />
      <div>
        <h1 className="text-2xl font-bold">🏠 Firewatch Home</h1>
        <p className="text-sm text-zinc-700">
          Smoke and carbon monoxide alarms tied to a home&apos;s postcode. When one goes off, family, neighbours and
          estate security get a call and SMS with the address, landmark and map pin.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {homes.map((h) => {
          const sensors = h.shops.flatMap((s) => s.sensors).filter((x) => x.kind !== "panic");
          const alert = alertFor(h.id);
          const st = alert ? "alarm" : worstStatus(sensors.map((x) => x.status));
          const style = STATUS_STYLE[st] ?? STATUS_STYLE.none;
          const lastSeen = sensors.map((x) => x.last_seen_at).filter(Boolean).sort().pop() ?? null;
          return (
            <Link key={h.id} href={`/homes/${h.id}`} className={`block rounded-lg p-4 ${style.tile}`}>
              <div className="text-lg font-bold">{h.name}</div>
              <div className="text-sm">{[h.address, h.city].filter(Boolean).join(", ")}</div>
              <div className="mt-1 font-mono text-sm font-bold">
                {h.nipost_postcode ?? "No postcode"}
                {h.postcode_status === "verified" && " ✓ NIPOST"}
                {(h.postcode_status === "not_found" || h.postcode_status === "invalid_format") && " ✗ check postcode"}
              </div>
              <div className="mt-2 text-sm font-semibold">
                {alert ? (alert.hazard === "co" ? "☠️ CARBON MONOXIDE" : "🔥 FIRE ALARM") : style.label}
              </div>
              <div className="text-sm">
                {sensors.length} device{sensors.length === 1 ? "" : "s"} · last seen {ago(lastSeen)} ·{" "}
                {h.shops[0]?.owner_name}
              </div>
            </Link>
          );
        })}
        {!homes.length && <p className="text-zinc-600">No homes yet. Add the first one below.</p>}
      </section>

      <form action={createHome} className="max-w-2xl space-y-3 rounded-lg border bg-white p-4">
        <h2 className="font-semibold">Add a home</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <input name="name" required placeholder="Name, e.g. Mum's house, Enugu" className={`${input} sm:col-span-2`} />
          <input name="address" required placeholder="Street address" className={`${input} sm:col-span-2`} />
          <input name="city" required placeholder="City / town" className={input} />
          <input name="state" placeholder="State" className={input} />
          <div className="sm:col-span-2">
            <input
              name="nipost_postcode"
              placeholder="NIPOST postcode, e.g. EK-01-A03-FK-01"
              className={`${input} font-mono uppercase`}
            />
            <p className="mt-1 text-sm text-zinc-700">
              Checked with NIPOST when you save. Don&apos;t know it? Leave it blank and add the map pin below, and
              Firewatch will look it up — or find it at{" "}
              <a href="https://postcode.gov.ng/find" target="_blank" className="font-medium underline">
                postcode.gov.ng/find
              </a>
              .
            </p>
          </div>
          <input name="landmark" placeholder="Landmark, e.g. opposite St Mary's church" className={`${input} sm:col-span-2`} />
          <input name="lat" placeholder="Map pin latitude (optional)" className={input} />
          <input name="lng" placeholder="Map pin longitude (optional)" className={input} />
        </div>
        <h3 className="pt-2 text-sm font-semibold">Who lives there (called first)</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <input name="owner_name" required placeholder="Resident name" className={input} />
          <input name="owner_phone" required placeholder="Phone (0803… or +234…)" className={input} />
          <input name="backup_phone" placeholder="Second phone (optional)" className={input} />
          <LangSelect name="owner_language" />
        </div>
        <button className="rounded bg-zinc-900 px-3 py-2 text-sm font-semibold text-white">Add home</button>
      </form>
    </div>
  );
}
