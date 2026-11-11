import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/supabase";
import { env } from "@/lib/env";
import { STATUS_STYLE, ago } from "@/lib/ui";
import { addHomeContact, addHomeDevice, recheckHomePostcode, testAlarm, toggleContact } from "@/app/actions";
import PostcodeBadge from "@/components/PostcodeBadge";
import PanicLink from "@/components/PanicLink";
import LangSelect from "@/components/LangSelect";
import { LANGS } from "@/lib/i18n";
import { nipostEnabled } from "@/lib/nipost";
import AutoRefresh from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

const input = "w-full rounded border p-2 text-sm";
const btn = "rounded bg-zinc-900 px-3 py-2 text-sm font-semibold text-white";

const ROLE_LABEL: Record<string, string> = {
  family: "Family",
  neighbour: "Neighbour",
  estate_security: "Estate security",
  fire_service: "Fire service",
  security: "Security",
};

const KIND_LABEL: Record<string, string> = {
  smoke_co: "Smoke + carbon monoxide",
  smoke: "Smoke",
  co: "Carbon monoxide",
  smoke_heat: "Smoke + heat",
  heat: "Heat",
};

type Sensor = {
  id: string;
  dev_eui: string;
  device_key: string | null;
  kind: string;
  label: string | null;
  status: string;
  battery_pct: number | null;
  co_ppm: number | null;
  temperature_c: number | null;
  last_seen_at: string | null;
};

export default async function HomePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supa = db();
  const { data: home } = await supa
    .from("markets")
    .select("*, shops(id, owner_name, owner_phone, backup_phone, panic_token, sensors(*))")
    .eq("id", id)
    .eq("kind", "home")
    .maybeSingle();
  if (!home) notFound();

  const household = (
    home.shops as {
      owner_name: string;
      owner_phone: string;
      backup_phone: string | null;
      panic_token: string | null;
      sensors: Sensor[];
    }[]
  )[0];
  const sensors = (household?.sensors ?? []).filter((x) => x.kind !== "panic");

  const [{ data: contacts }, { data: alerts }] = await Promise.all([
    supa.from("contacts").select("*").eq("market_id", id).order("tier"),
    supa
      .from("alerts")
      .select("id, status, hazard, created_at, acknowledged_by, acknowledged_at")
      .eq("market_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  const open = alerts?.find((a) => a.status === "open" || a.status === "acknowledged");
  const map = home.lat !== null && home.lng !== null ? `https://maps.google.com/?q=${home.lat},${home.lng}` : null;

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={10} />
      <div>
        <Link href="/homes" className="text-sm underline">← All homes</Link>
        <h1 className="mt-1 text-2xl font-bold">🏠 {home.name}</h1>
        <p className="text-zinc-700">
          {[home.address, home.city, home.state].filter(Boolean).join(", ")}
          {home.landmark && <> · near {home.landmark}</>}
          {map && (
            <>
              {" · "}
              <a href={map} target="_blank" className="underline">Map pin</a>
            </>
          )}
        </p>
        <p className="text-sm text-zinc-700">
          Resident: {household?.owner_name} · {household?.owner_phone}
          {household?.backup_phone && ` · ${household.backup_phone}`}
        </p>
      </div>

      <section className="space-y-3 rounded-lg border-2 border-zinc-900 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">📮 NIPOST digital postcode</h2>
          {home.postcode_checked_at && (
            <span className="text-sm text-zinc-700">checked {ago(home.postcode_checked_at)}</span>
          )}
        </div>
        <PostcodeBadge postcode={home.nipost_postcode} status={home.postcode_status} />
        {(home.postcode_locality || home.postcode_lga || home.postcode_state) && (
          <p className="text-zinc-900">
            {[home.postcode_locality, home.postcode_lga && `${home.postcode_lga} LGA`, home.postcode_state]
              .filter(Boolean)
              .join(", ")}
          </p>
        )}
        {home.postcode_note && <p className="text-sm text-zinc-700">{home.postcode_note}</p>}
        <p className="text-sm text-zinc-700">
          Every alert for this home carries this postcode, so responders and the fire service go to the exact building.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <form action={recheckHomePostcode} className="flex flex-wrap gap-2">
            <input type="hidden" name="market_id" value={id} />
            <input
              name="nipost_postcode"
              defaultValue={home.nipost_postcode ?? ""}
              placeholder="EK-01-A03-FK-01"
              className={`${input} max-w-[14rem] font-mono uppercase`}
            />
            <button className={btn}>{nipostEnabled() ? "Check with NIPOST" : "Save postcode"}</button>
          </form>
          {map && nipostEnabled() && (
            <form action={recheckHomePostcode}>
              <input type="hidden" name="market_id" value={id} />
              <input type="hidden" name="mode" value="pin" />
              <button className="rounded border-2 border-zinc-900 px-3 py-2 text-sm font-semibold">
                📍 Find postcode from map pin
              </button>
            </form>
          )}
        </div>
        {!nipostEnabled() && (
          <p className="rounded bg-amber-100 p-2 text-sm text-amber-900">
            Live NIPOST checks switch on when <code className="font-mono">NIPOST_API_KEY</code> is added in Vercel.
            Until then the postcode format is checked here.
          </p>
        )}
      </section>

      {open && (
        <Link
          href={`/alerts/${open.id}`}
          className={`block rounded-lg p-4 text-white ${open.status === "open" ? "animate-pulse bg-red-600" : "bg-orange-500"}`}
        >
          <div className="text-lg font-bold">
            {open.hazard === "co" ? "☠️ CARBON MONOXIDE" : "🔥 FIRE ALARM"} —{" "}
            {open.status === "open" ? "NOT YET ACKNOWLEDGED" : `RESPONDING: ${open.acknowledged_by}`}
          </div>
          <div>Started {ago(open.created_at)}. Tap to manage.</div>
        </Link>
      )}

      <PanicLink token={household?.panic_token ?? null} />

      <section className="space-y-3">
        <h2 className="font-semibold">Devices</h2>
        {sensors.map((s) => {
          const st = STATUS_STYLE[s.status] ?? STATUS_STYLE.unassigned;
          return (
            <div key={s.id} className="space-y-2 rounded-lg border bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className={`mr-2 inline-block h-2 w-2 rounded-full ${st.dot}`} />
                  <b>{s.label ?? "Alarm"}</b> · {KIND_LABEL[s.kind] ?? s.kind} · {st.label}
                </div>
                <div className="text-sm text-zinc-700">
                  seen {ago(s.last_seen_at)} · battery {s.battery_pct ?? "?"}%
                  {s.co_ppm !== null && ` · CO ${s.co_ppm} ppm`}
                  {s.temperature_c !== null && ` · ${s.temperature_c}°C`}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <form action={testAlarm}>
                  <input type="hidden" name="dev_eui" value={s.dev_eui} />
                  <input type="hidden" name="hazard" value="fire" />
                  <button className="rounded bg-red-600 px-3 py-1.5 text-sm font-semibold text-white">Fire drill</button>
                </form>
                <form action={testAlarm}>
                  <input type="hidden" name="dev_eui" value={s.dev_eui} />
                  <input type="hidden" name="hazard" value="co" />
                  <button className="rounded bg-purple-700 px-3 py-1.5 text-sm font-semibold text-white">CO drill</button>
                </form>
                {s.device_key && (
                  <a
                    href={`/sensor/${s.dev_eui}?k=${s.device_key}`}
                    target="_blank"
                    className="rounded border border-zinc-900 px-3 py-1.5 text-sm font-semibold"
                  >
                    📱 Open virtual sensor
                  </a>
                )}
              </div>
              {s.device_key && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-zinc-700">Firmware settings for this device</summary>
                  <pre className="mt-2 overflow-x-auto rounded bg-zinc-100 p-2">{`#define FW_SERVER     "${env.appUrl()}/api/device"
#define FW_DEVICE_ID  "${s.dev_eui}"
#define FW_DEVICE_KEY "${s.device_key}"`}</pre>
                </details>
              )}
            </div>
          );
        })}
        <form action={addHomeDevice} className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed bg-white p-4">
          <input type="hidden" name="market_id" value={id} />
          <input name="label" placeholder="Where, e.g. Kitchen / Generator room" className={`${input} max-w-xs`} />
          <select name="kind" className={`${input} max-w-xs`}>
            <option value="smoke_co">Smoke + carbon monoxide</option>
            <option value="smoke">Smoke only</option>
            <option value="co">Carbon monoxide only</option>
          </select>
          <button className={btn}>Add device</button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Who gets alerted</h2>
        <p className="text-sm text-zinc-700">
          The resident and tier 0 are called and texted straight away. If nobody presses 1 or taps the link within{" "}
          {env.escalationSeconds()}s, the next tier is called. Family abroad can be any tier: they get the SMS and can
          coordinate.
        </p>
        <table className="w-full rounded-lg bg-white text-sm shadow-sm">
          <tbody>
            {(contacts ?? []).map((c) => (
              <tr key={c.id} className={`border-t ${c.active ? "" : "opacity-40"}`}>
                <td className="p-2">Tier {c.tier}</td>
                <td className="p-2">{c.name}</td>
                <td className="p-2">{c.phone}</td>
                <td className="p-2">{ROLE_LABEL[c.role] ?? c.role}</td>
                <td className="p-2">{LANGS.find((l) => l.code === c.language)?.label ?? "English"}</td>
                <td className="p-2 text-right">
                  <form action={toggleContact}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="active" value={String(!c.active)} />
                    <button className="text-sm font-medium underline">{c.active ? "Disable" : "Enable"}</button>
                  </form>
                </td>
              </tr>
            ))}
            {!contacts?.length && (
              <tr>
                <td className="p-3 text-zinc-600">Only the resident so far. Add family, a neighbour and estate security.</td>
              </tr>
            )}
          </tbody>
        </table>
        <form action={addHomeContact} className="grid gap-2 rounded-lg border bg-white p-4 sm:grid-cols-3 lg:grid-cols-6">
          <input type="hidden" name="market_id" value={id} />
          <input name="name" required placeholder="Name" className={input} />
          <input name="phone" required placeholder="Phone (+44… or 0803…)" className={input} />
          <select name="role" className={input}>
            <option value="family">Family</option>
            <option value="neighbour">Neighbour</option>
            <option value="estate_security">Estate security</option>
            <option value="fire_service">Fire service</option>
          </select>
          <select name="tier" className={input}>
            {[0, 1, 2, 3].map((t) => (
              <option key={t} value={t}>Tier {t}</option>
            ))}
          </select>
          <LangSelect />
          <button className={btn}>Add</button>
        </form>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Recent alerts</h2>
        <ul className="space-y-1 text-sm">
          {(alerts ?? []).map((a) => (
            <li key={a.id}>
              <Link href={`/alerts/${a.id}`} className="underline">
                {a.hazard === "co" ? "Carbon monoxide" : "Fire"} · {a.status.replace("_", " ")} · {ago(a.created_at)}
              </Link>
              {a.acknowledged_at &&
                ` · answered in ${Math.round((new Date(a.acknowledged_at).getTime() - new Date(a.created_at).getTime()) / 1000)}s by ${a.acknowledged_by}`}
            </li>
          ))}
          {!alerts?.length && <li className="text-zinc-600">No alerts yet. Run a drill above.</li>}
        </ul>
      </section>
    </div>
  );
}
