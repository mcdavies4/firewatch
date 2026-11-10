import Link from "next/link";
import { db } from "@/lib/supabase";
import { STATUS_STYLE } from "@/lib/ui";
import { closeAllAlerts, createDemo, enableVirtualSensor, sendTestSms, testAlarm } from "@/app/actions";
import { explainDelivery } from "@/lib/notify/explain";
import AutoRefresh from "@/components/AutoRefresh";
import DbError from "@/components/DbError";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  dev_eui: string;
  device_key: string | null;
  label: string | null;
  kind: string;
  status: string;
  shops: {
    id: string;
    shop_number: string;
    markets: { id: string; name: string; kind: string } | null;
  } | null;
};

export default async function Demo({ searchParams }: { searchParams: Promise<{ sms?: string; why?: string }> }) {
  const { sms, why } = await searchParams;
  const supa = db();
  const live = process.env.NOTIFY_MODE === "live";
  const atReady = !!process.env.AT_USERNAME && !!process.env.AT_API_KEY;
  const sender = process.env.AT_SMS_SENDER || null;
  const sandbox = process.env.AT_ENV === "sandbox";
  const [{ data, error }, { data: openAlerts }, { data: recentSms }] = await Promise.all([
    supa
      .from("sensors")
      .select("id, dev_eui, device_key, label, kind, status, shops(id, shop_number, markets(id, name, kind))")
      .not("shop_id", "is", null)
      .order("created_at"),
    supa.from("alerts").select("id").in("status", ["open", "acknowledged"]),
    supa
      .from("alert_attempts")
      .select("id, created_at, contact_name, contact_phone, status, detail, alert_id")
      .eq("channel", "sms")
      .order("created_at", { ascending: false })
      .limit(6),
  ]);
  if (error) return <DbError message={error.message} />;

  const rows = (data ?? []) as unknown as Row[];
  const homes = rows.filter((r) => r.shops?.markets?.kind === "home");
  const markets = rows.filter((r) => r.shops?.markets?.kind !== "home");
  const hasCo = (k: string) => k.includes("co");

  const Device = ({ r }: { r: Row }) => {
    const st = STATUS_STYLE[r.status] ?? STATUS_STYLE.unassigned;
    const site = r.shops?.markets;
    const where = site?.kind === "home" ? (r.label ?? "Alarm") : `Shop ${r.shops?.shop_number}`;
    const page = site?.kind === "home" ? `/homes/${site.id}` : `/shops/${r.shops?.id}`;
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-3">
        <div>
          <div className="font-semibold text-zinc-900">
            <span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${st.dot}`} />
            {site?.name} — {where}
          </div>
          <div className="text-sm text-zinc-700">
            {st.label} ·{" "}
            <Link href={page} className="underline">
              open page
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {r.device_key ? (
            <a
              href={`/sensor/${r.dev_eui}?k=${r.device_key}`}
              target="_blank"
              className="rounded bg-zinc-900 px-3 py-2 text-sm font-semibold text-white"
            >
              📱 Virtual sensor
            </a>
          ) : (
            <form action={enableVirtualSensor}>
              <input type="hidden" name="sensor_id" value={r.id} />
              <button className="rounded border-2 border-zinc-900 px-3 py-2 text-sm font-semibold">
                Enable virtual sensor
              </button>
            </form>
          )}
          <form action={testAlarm}>
            <input type="hidden" name="dev_eui" value={r.dev_eui} />
            <input type="hidden" name="hazard" value="fire" />
            <button className="rounded bg-red-600 px-3 py-2 text-sm font-semibold text-white">🔥 Fire</button>
          </form>
          {hasCo(r.kind) && (
            <form action={testAlarm}>
              <input type="hidden" name="dev_eui" value={r.dev_eui} />
              <input type="hidden" name="hazard" value="co" />
              <button className="rounded bg-purple-700 px-3 py-2 text-sm font-semibold text-white">☠️ CO</button>
            </form>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <AutoRefresh seconds={15} />
      <div>
        <h1 className="text-2xl font-bold">🎬 Demo</h1>
        <p className="text-zinc-800">Trigger any sensor without hardware. The real texts, escalation and responder page all run.</p>
      </div>

      <ol className="list-decimal space-y-1 rounded-lg border bg-white p-4 pl-8 text-zinc-900">
        <li>
          No devices below? Fill in <b>Set up the demo</b> with your phone number.
        </li>
        <li>
          Press <b>📱 Virtual sensor</b> on a device. It opens a page that looks like the alarm. Send that page&apos;s link
          to a second phone, or keep it on this screen.
        </li>
        <li>
          Tap <b>Smoke detected</b> or <b>Carbon monoxide</b> on it. Your phone gets the alert text in seconds.
        </li>
        <li>
          Tap the link in the text, then <b>I&apos;M RESPONDING</b>. The dashboard turns orange and everyone gets the update.
        </li>
        <li>
          Before the next take, press <b>Reset: close all alerts</b>. A device won&apos;t text again while its alert is open.
        </li>
      </ol>
      <p className="text-sm text-zinc-700">
        Quick test with no second phone: the 🔥 Fire and ☠️ CO buttons fire the alarm straight from here.
      </p>

      <section id="delivery" className="space-y-3 rounded-lg border-2 border-zinc-900 bg-white p-4">
        <h2 className="text-lg font-bold">📶 Text delivery check</h2>
        <ul className="space-y-1 text-zinc-900">
          <li>
            {live ? "✅" : "❌"} Sending mode: <b>{live ? "live" : "test (texts are only logged)"}</b>
            {!live && <span> — set <code className="font-mono">NOTIFY_MODE=live</code> in Vercel and redeploy</span>}
          </li>
          <li>
            {atReady ? "✅" : "❌"} Africa&apos;s Talking keys {atReady ? "set" : "missing — add AT_USERNAME and AT_API_KEY in Vercel"}
            {sandbox && <b className="text-amber-800"> · SANDBOX mode: texts only appear in the AT simulator, not on real phones</b>}
          </li>
          <li>
            ℹ️ Sender ID: <b>{sender ?? "default (none set)"}</b>
            {sender && <span className="text-zinc-700"> — if texts fail, it may not be approved yet; clear AT_SMS_SENDER</span>}
          </li>
          <li>ℹ️ Use a Nigerian number (+234) unless your Africa&apos;s Talking account can send abroad.</li>
        </ul>

        {sms && (
          <div
            className={`rounded p-3 font-semibold ${sms === "sent" ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900"}`}
          >
            {sms === "sent" ? "✅ " : "❌ "}
            {why}
          </div>
        )}

        <form action={sendTestSms} className="flex flex-wrap gap-2">
          <input name="phone" required placeholder="Phone (0803… or +234…)" className="w-60 rounded border p-2" />
          <button className="rounded bg-zinc-900 px-4 py-2 font-semibold text-white">Send test SMS</button>
        </form>

        {!!recentSms?.length && (
          <div>
            <div className="mb-1 text-sm font-semibold">Last alert texts</div>
            <ul className="space-y-1 text-sm">
              {recentSms.map((t) => (
                <li key={t.id} className="text-zinc-900">
                  <Link href={`/alerts/${t.alert_id}`} className="underline">
                    {new Date(t.created_at).toLocaleTimeString("en-GB")}
                  </Link>{" "}
                  → {t.contact_name} {t.contact_phone}:{" "}
                  <b className={t.status === "sent" ? "text-emerald-800" : "text-red-700"}>{t.status}</b>
                  {t.status === "logged" && " (test mode)"}
                  {t.status === "failed" && ` — ${explainDelivery(t.detail)}`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <form action={closeAllAlerts}>
          <button className="rounded border-2 border-zinc-900 bg-white px-4 py-2 font-semibold">
            ↺ Reset: close all alerts ({openAlerts?.length ?? 0} open)
          </button>
        </form>
        <Link href="/dashboard" className="font-semibold underline">Market dashboard</Link>
        <Link href="/homes" className="font-semibold underline">Homes</Link>
        <Link href="/alerts" className="font-semibold underline">Alerts</Link>
      </div>

      {homes.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold">🏠 Home devices</h2>
          {homes.map((r) => <Device key={r.id} r={r} />)}
        </section>
      )}

      {markets.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold">🏪 Market devices</h2>
          {markets.map((r) => <Device key={r.id} r={r} />)}
        </section>
      )}

      <form action={createDemo} className="max-w-xl space-y-3 rounded-lg border-2 border-zinc-900 bg-white p-4">
        <h2 className="text-lg font-bold">Set up the demo</h2>
        <p className="text-sm text-zinc-800">
          Creates <b>Demo Market</b> (Lines A and B, 6 shops with a sensor each) and <b>Demo Home</b> (generator room
          smoke + CO, kitchen smoke). All alerts go to the number below.
        </p>
        <input name="name" placeholder="Your name" className="w-full rounded border p-2" />
        <input name="phone" required placeholder="Phone for demo alerts (0803… or +234…)" className="w-full rounded border p-2" />
        <input
          name="postcode"
          placeholder="NIPOST postcode for the demo home (optional)"
          className="w-full rounded border p-2 font-mono uppercase"
        />
        <button className="rounded bg-zinc-900 px-4 py-2 font-semibold text-white">Create demo market + home</button>
      </form>
    </div>
  );
}
