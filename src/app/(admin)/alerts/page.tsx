import Link from "next/link";
import { db } from "@/lib/supabase";
import { ago } from "@/lib/ui";
import AutoRefresh from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

const BADGE: Record<string, string> = {
  open: "bg-red-600 text-white",
  acknowledged: "bg-orange-500 text-white",
  resolved: "bg-emerald-600 text-white",
  false_alarm: "bg-zinc-400 text-white",
};

export default async function Alerts() {
  const { data } = await db()
    .from("alerts")
    .select("id, status, created_at, acknowledged_by, acknowledged_at, shops(shop_number, owner_name), markets(name)")
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (data ?? []) as unknown as {
    id: string;
    status: string;
    created_at: string;
    acknowledged_by: string | null;
    acknowledged_at: string | null;
    shops: { shop_number: string; owner_name: string } | null;
    markets: { name: string } | null;
  }[];

  return (
    <div>
      <AutoRefresh seconds={10} />
      <h1 className="mb-4 text-2xl font-bold">Alerts</h1>
      <table className="w-full overflow-hidden rounded-lg bg-white text-sm shadow-sm">
        <thead className="bg-zinc-100 text-left">
          <tr>
            <th className="p-2">Status</th>
            <th className="p-2">Shop</th>
            <th className="p-2">Market</th>
            <th className="p-2">Started</th>
            <th className="p-2">Response time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => {
            const resp = a.acknowledged_at
              ? Math.round((new Date(a.acknowledged_at).getTime() - new Date(a.created_at).getTime()) / 1000)
              : null;
            return (
              <tr key={a.id} className="border-t">
                <td className="p-2">
                  <Link href={`/alerts/${a.id}`}>
                    <span className={`rounded px-2 py-0.5 text-xs ${BADGE[a.status]}`}>{a.status.replace("_", " ")}</span>
                  </Link>
                </td>
                <td className="p-2">
                  <Link className="underline" href={`/alerts/${a.id}`}>
                    {a.shops?.shop_number} — {a.shops?.owner_name}
                  </Link>
                </td>
                <td className="p-2">{a.markets?.name}</td>
                <td className="p-2">{ago(a.created_at)}</td>
                <td className="p-2">{resp === null ? "—" : `${resp}s by ${a.acknowledged_by}`}</td>
              </tr>
            );
          })}
          {!rows.length && (
            <tr>
              <td className="p-4 text-zinc-500" colSpan={5}>No alerts yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
