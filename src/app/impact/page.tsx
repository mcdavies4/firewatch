import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Firewatch impact — fire response across Nigeria",
  description: "Live, anonymous figures: buildings protected, alerts, response times and drills by state and LGA.",
};

type AlertRow = {
  created_at: string;
  acknowledged_at: string | null;
  status: string;
  hazard: string;
  is_drill: boolean | null;
  source: string | null;
  markets: { kind: string; state: string | null; postcode_state: string | null; postcode_lga: string | null } | null;
  shops: { postcode_state: string | null; postcode_lga: string | null } | null;
};

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const fmtSecs = (s: number | null) =>
  s === null ? "—" : s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
const title = (v: string | null) => (v ? v.replace(/\b\w/g, (c) => c.toUpperCase()) : null);

/** Public, anonymous impact page: what Firewatch has done, by state and LGA. */
export default async function Impact() {
  const supa = db();
  const since30 = Date.now() - 30 * 86400_000;
  const offlineMs = Number(process.env.OFFLINE_MINUTES ?? 180) * 60_000;

  const [{ data: alertsRaw }, { data: sites }, { data: shops }, { data: sensors }] = await Promise.all([
    supa
      .from("alerts")
      .select(
        "created_at, acknowledged_at, status, hazard, is_drill, source, markets(kind, state, postcode_state, postcode_lga), shops(postcode_state, postcode_lga)",
      )
      .order("created_at", { ascending: false })
      .limit(5000),
    supa.from("markets").select("kind, state"),
    supa.from("shops").select("id, markets(kind)"),
    supa.from("sensors").select("status, last_seen_at, kind").not("shop_id", "is", null),
  ]);

  const alerts = (alertsRaw ?? []) as unknown as AlertRow[];
  const real = alerts.filter((a) => !a.is_drill);
  const drills = alerts.filter((a) => a.is_drill);
  const secs = (a: AlertRow) =>
    a.acknowledged_at ? (new Date(a.acknowledged_at).getTime() - new Date(a.created_at).getTime()) / 1000 : null;
  const respTimes = (xs: AlertRow[]) => xs.map(secs).filter((x): x is number => x !== null && x >= 0);

  const realTimes = respTimes(real);
  const drillTimes = respTimes(drills);
  const within2 = realTimes.length ? Math.round((realTimes.filter((s) => s <= 120).length / realTimes.length) * 100) : null;
  const markets = (sites ?? []).filter((m) => m.kind === "market").length;
  const homes = (sites ?? []).filter((m) => m.kind === "home").length;
  const shopCount = ((shops ?? []) as unknown as { markets: { kind: string } | null }[]).filter(
    (s) => s.markets?.kind === "market",
  ).length;
  const devices = (sensors ?? []).filter((s) => s.kind !== "panic");
  const online = devices.filter(
    (s) => s.last_seen_at && Date.now() - new Date(s.last_seen_at).getTime() < offlineMs && s.status !== "offline",
  ).length;

  // By state → LGA, from each building's NIPOST postcode (falling back to the site's state).
  type Area = { state: string; lga: string; incidents: number; drills: number; times: number[] };
  const areas = new Map<string, Area>();
  for (const a of alerts) {
    const home = a.markets?.kind === "home";
    const src = home ? a.markets : a.shops;
    const state = title(src?.postcode_state ?? a.markets?.state ?? null) ?? "Unknown";
    const lga = title(src?.postcode_lga ?? null) ?? "—";
    const key = `${state}|${lga}`;
    const ar = areas.get(key) ?? { state, lga, incidents: 0, drills: 0, times: [] };
    if (a.is_drill) ar.drills++;
    else ar.incidents++;
    const t = secs(a);
    if (!a.is_drill && t !== null && t >= 0) ar.times.push(t);
    areas.set(key, ar);
  }
  const areaRows = [...areas.values()].sort((x, y) => y.incidents + y.drills - (x.incidents + x.drills));
  const maxArea = Math.max(1, ...areaRows.map((r) => r.incidents + r.drills));

  const stat = (label: string, value: string | number, note?: string) => (
    <div className="rounded-xl border-2 border-zinc-200 bg-white p-4">
      <div className="text-3xl font-extrabold text-zinc-950">{value}</div>
      <div className="font-semibold text-zinc-800">{label}</div>
      {note && <div className="text-sm text-zinc-700">{note}</div>}
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="bg-zinc-950 text-white">
        <div className="mx-auto max-w-6xl px-5 py-8">
          <Link href="/" className="text-sm font-semibold tracking-widest text-red-400">🔥 FIREWATCH</Link>
          <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Impact</h1>
          <p className="mt-2 max-w-2xl text-zinc-200">
            Live figures from Firewatch across markets and homes. Every building is located by its NIPOST digital
            postcode. Anonymous: no names, numbers or addresses are shown.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-10 px-5 py-8">
        <section>
          <h2 className="mb-3 text-xl font-bold">Coverage</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {stat("Markets", markets)}
            {stat("Shops protected", shopCount)}
            {stat("Homes protected", homes)}
            {stat("Devices online", `${online}/${devices.length}`, devices.length ? `${Math.round((online / devices.length) * 100)}% reporting` : undefined)}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold">Response</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {stat("Real alerts", real.length, `${real.filter((a) => Date.now() - new Date(a.created_at).getTime() < 30 * 86400_000).length} in the last 30 days`)}
            {stat("Median time to a responder", fmtSecs(median(realTimes)), "from alarm to someone pressing I'm responding")}
            {stat("Answered within 2 minutes", within2 === null ? "—" : `${within2}%`)}
            {stat("Carbon monoxide alerts", real.filter((a) => a.hazard === "co").length, "generator fumes caught")}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold">Preparedness</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {stat("Drills run", drills.length, `${drills.filter((a) => new Date(a.created_at).getTime() > since30).length} in the last 30 days`)}
            {stat("Median drill response", fmtSecs(median(drillTimes)))}
            {stat("Panic-button reports", real.filter((a) => a.source === "panic").length, "raised by people, no sensor needed")}
            {stat("False alarms", real.filter((a) => a.status === "false_alarm").length, "closed as false alarm")}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold">By state and LGA</h2>
          {areaRows.length ? (
            <div className="overflow-hidden rounded-xl border-2 border-zinc-200 bg-white">
              <table className="w-full text-left">
                <thead className="bg-zinc-100 text-sm">
                  <tr>
                    <th className="p-3">State</th>
                    <th className="p-3">LGA</th>
                    <th className="p-3">Alerts</th>
                    <th className="p-3">Drills</th>
                    <th className="p-3">Median response</th>
                    <th className="hidden p-3 sm:table-cell" />
                  </tr>
                </thead>
                <tbody>
                  {areaRows.map((r) => (
                    <tr key={r.state + r.lga} className="border-t">
                      <td className="p-3 font-semibold">{r.state}</td>
                      <td className="p-3">{r.lga}</td>
                      <td className="p-3">{r.incidents}</td>
                      <td className="p-3">{r.drills}</td>
                      <td className="p-3">{fmtSecs(median(r.times))}</td>
                      <td className="hidden w-1/3 p-3 sm:table-cell">
                        <div className="flex h-3 overflow-hidden rounded bg-zinc-100">
                          <div className="bg-red-600" style={{ width: `${(r.incidents / maxArea) * 100}%` }} />
                          <div className="bg-amber-400" style={{ width: `${(r.drills / maxArea) * 100}%` }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex gap-4 border-t p-3 text-sm text-zinc-700">
                <span><span className="mr-1 inline-block h-3 w-3 rounded bg-red-600 align-middle" /> alerts</span>
                <span><span className="mr-1 inline-block h-3 w-3 rounded bg-amber-400 align-middle" /> drills</span>
              </div>
            </div>
          ) : (
            <p className="text-zinc-700">No alerts or drills yet.</p>
          )}
        </section>

        <p className="text-sm text-zinc-700">
          Drills are counted separately from real alerts. Firewatch by The 36th Solutions Ltd ·{" "}
          <Link href="/" className="underline">firewatch home</Link>
        </p>
      </main>
    </div>
  );
}
