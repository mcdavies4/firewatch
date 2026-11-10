import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/supabase";
import { AUDIT_ITEMS, PASS_MARK, STATUS_STYLE, ago } from "@/lib/ui";
import { recheckShopPostcode, submitAudit, testAlarm } from "@/app/actions";
import PostcodeBadge from "@/components/PostcodeBadge";

export const dynamic = "force-dynamic";

export default async function ShopPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supa = db();
  const { data: shop } = await supa
    .from("shops")
    .select("*, sections(name), markets(name), sensors(*)")
    .eq("id", id)
    .maybeSingle();
  if (!shop) notFound();

  const [{ data: audits }, { data: alerts }] = await Promise.all([
    supa.from("audits").select("*").eq("shop_id", id).order("created_at", { ascending: false }),
    supa.from("alerts").select("id, status, created_at").eq("shop_id", id).order("created_at", { ascending: false }).limit(10),
  ]);
  const latestCert = audits?.find((a) => a.passed);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Shop {shop.shop_number}</h1>
        <p className="text-zinc-700">
          {shop.owner_name} · {shop.owner_phone} · {shop.trade ?? "—"} · {shop.sections?.name ?? "No section"},{" "}
          {shop.markets?.name}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <PostcodeBadge
            postcode={shop.nipost_postcode}
            status={shop.postcode_status}
            detail={[shop.postcode_lga && `${shop.postcode_lga} LGA`, shop.postcode_state].filter(Boolean).join(", ") || null}
          />
          <form action={recheckShopPostcode} className="flex gap-2">
            <input type="hidden" name="shop_id" value={shop.id} />
            <input
              name="nipost_postcode"
              defaultValue={shop.nipost_postcode ?? ""}
              placeholder="EK-01-A03-FK-01"
              className="w-40 rounded border p-1.5 font-mono uppercase"
            />
            <button className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white">Check</button>
          </form>
        </div>
        {latestCert && (
          <Link href={`/cert/${latestCert.certificate_code}`} className="mt-2 inline-block rounded bg-emerald-600 px-3 py-1 text-sm text-white">
            ✓ Certified {latestCert.certificate_code} — valid to {latestCert.valid_until}
          </Link>
        )}
      </div>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-2 font-semibold">Sensors</h2>
        {(shop.sensors ?? []).length === 0 && <p className="text-sm text-zinc-600">No sensor assigned. Use Setup.</p>}
        {(shop.sensors ?? []).map((s: { id: string; dev_eui: string; status: string; battery_pct: number | null; last_seen_at: string | null; last_rssi: number | null }) => (
          <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-t py-2 text-sm first:border-t-0">
            <div>
              <span className={`mr-2 inline-block h-2 w-2 rounded-full ${STATUS_STYLE[s.status]?.dot}`} />
              <span className="font-mono">{s.dev_eui}</span> · {STATUS_STYLE[s.status]?.label} · battery {s.battery_pct ?? "?"}% ·
              signal {s.last_rssi ?? "?"} dBm · seen {ago(s.last_seen_at)}
            </div>
            <form action={testAlarm}>
              <input type="hidden" name="dev_eui" value={s.dev_eui} />
              <button className="rounded bg-red-600 px-3 py-1 text-white">Run fire drill</button>
            </form>
          </div>
        ))}
        <p className="mt-2 text-xs text-zinc-600">
          “Run fire drill” sends a simulated alarm through the real call/SMS chain. Warn responders first.
        </p>
      </section>

      <form action={submitAudit} className="space-y-3 rounded-lg border bg-white p-4">
        <h2 className="font-semibold">Fire safety audit</h2>
        <input type="hidden" name="shop_id" value={id} />
        {AUDIT_ITEMS.map((i) => (
          <label key={i.key} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name={i.key} className="h-4 w-4" /> {i.label}
          </label>
        ))}
        <input name="auditor_name" required placeholder="Auditor name" className="w-full rounded border p-2 text-sm" />
        <textarea name="notes" placeholder="Notes / actions required" className="w-full rounded border p-2 text-sm" />
        <button className="rounded bg-zinc-900 px-4 py-2 text-sm font-semibold text-white">
          Submit audit (pass mark {PASS_MARK}%)
        </button>
      </form>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border bg-white p-4 text-sm">
          <h2 className="mb-2 font-semibold">Audit history</h2>
          {(audits ?? []).map((a) => (
            <div key={a.id} className="border-t py-1 first:border-t-0">
              {new Date(a.created_at).toLocaleDateString("en-GB")} · {a.score}% · {a.passed ? "PASS" : "FAIL"} · {a.auditor_name}
            </div>
          ))}
        </div>
        <div className="rounded-lg border bg-white p-4 text-sm">
          <h2 className="mb-2 font-semibold">Alert history</h2>
          {(alerts ?? []).map((a) => (
            <Link key={a.id} href={`/alerts/${a.id}`} className="block border-t py-1 underline first:border-t-0">
              {new Date(a.created_at).toLocaleString("en-GB")} · {a.status}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
