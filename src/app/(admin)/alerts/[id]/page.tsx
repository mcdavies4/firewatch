import { notFound } from "next/navigation";
import { db } from "@/lib/supabase";
import { getAlertContext, locationText } from "@/lib/alerts/engine";
import { ackFromDashboard, closeAlertAction } from "@/app/actions";
import AutoRefresh from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

export default async function AlertDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAlertContext(id);
  if (!ctx) notFound();
  const a = ctx.alert as typeof ctx.alert & {
    created_at: string;
    acknowledged_by: string | null;
    acknowledged_at: string | null;
    resolved_at: string | null;
    resolution_note: string | null;
  };

  const { data: attempts } = await db()
    .from("alert_attempts")
    .select("*")
    .eq("alert_id", id)
    .order("created_at");

  const active = a.status === "open" || a.status === "acknowledged";

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={5} />
      <div className={`rounded-lg p-4 text-white ${a.status === "open" ? "bg-red-600" : active ? "bg-orange-500" : "bg-zinc-600"}`}>
        <div className="text-xl font-bold">🔥 {locationText(ctx)}</div>
        <div>
          Owner: {ctx.ownerName} ({ctx.ownerPhone}) · Status: {a.status.replace("_", " ")} · Started{" "}
          {new Date(a.created_at).toLocaleString("en-GB")}
        </div>
        {a.acknowledged_by && (
          <div>
            Responding: <b>{a.acknowledged_by}</b> at {new Date(a.acknowledged_at!).toLocaleTimeString("en-GB")} (
            {Math.round((new Date(a.acknowledged_at!).getTime() - new Date(a.created_at).getTime()) / 1000)}s after alarm)
          </div>
        )}
        {a.resolution_note && <div>Note: {a.resolution_note}</div>}
      </div>

      {active && (
        <div className="grid gap-4 sm:grid-cols-2">
          {a.status === "open" && (
            <form action={ackFromDashboard} className="space-y-2 rounded-lg border bg-white p-4">
              <input type="hidden" name="alert_id" value={id} />
              <label className="block text-sm font-medium">Who is responding?</label>
              <input name="by" placeholder="e.g. Night security – Musa" className="w-full rounded border p-2" />
              <button className="rounded bg-orange-500 px-4 py-2 font-semibold text-white">Mark as responding</button>
            </form>
          )}
          <form action={closeAlertAction} className="space-y-2 rounded-lg border bg-white p-4">
            <input type="hidden" name="alert_id" value={id} />
            <label className="block text-sm font-medium">Close alert</label>
            <input name="note" placeholder="What happened?" className="w-full rounded border p-2" />
            <div className="flex gap-2">
              <button name="outcome" value="resolved" className="rounded bg-emerald-600 px-4 py-2 font-semibold text-white">
                Fire handled
              </button>
              <button name="outcome" value="false_alarm" className="rounded bg-zinc-500 px-4 py-2 font-semibold text-white">
                False alarm
              </button>
            </div>
          </form>
        </div>
      )}

      <section>
        <h2 className="mb-2 font-semibold">Who was contacted</h2>
        <table className="w-full rounded-lg bg-white text-sm shadow-sm">
          <thead className="bg-zinc-100 text-left">
            <tr>
              <th className="p-2">Time</th>
              <th className="p-2">Tier</th>
              <th className="p-2">Contact</th>
              <th className="p-2">Role</th>
              <th className="p-2">Channel</th>
              <th className="p-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {(attempts ?? []).map((t) => (
              <tr key={t.id} className="border-t">
                <td className="p-2">{new Date(t.created_at).toLocaleTimeString("en-GB")}</td>
                <td className="p-2">{t.tier}</td>
                <td className="p-2">
                  {t.contact_name} <span className="text-zinc-500">{t.contact_phone}</span>
                </td>
                <td className="p-2">{t.role}</td>
                <td className="p-2">{t.channel}</td>
                <td className="p-2">{t.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
