import { db } from "@/lib/supabase";
import { getAlertContext, locationText } from "@/lib/alerts/engine";
import { ackFromLink } from "@/app/public-actions";

export const dynamic = "force-dynamic";

/** Opened from the SMS link. Acknowledging requires a button press so link previews can't trigger it. */
export default async function Ack({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { token } = await params;
  const { done } = await searchParams;
  const { data } = await db().from("alerts").select("id").eq("ack_token", token).maybeSingle();
  const ctx = data ? await getAlertContext(data.id) : null;

  if (!ctx) return <Shell><p>This alert link is not valid.</p></Shell>;

  const a = ctx.alert as typeof ctx.alert & { acknowledged_by: string | null };

  if (done || a.status !== "open") {
    return (
      <Shell>
        <h1 className="text-2xl font-bold">🔥 {locationText(ctx)}</h1>
        <p className="mt-2">
          {a.status === "acknowledged" ? `${a.acknowledged_by} is responding.` : `This alert is ${a.status.replace("_", " ")}.`}
        </p>
        <p className="mt-4 font-semibold">If it is safe, go and help. If not, call 112 and keep people away.</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-2xl font-bold text-red-600">🔥 FIRE ALERT</h1>
      <p className="mt-1 text-lg">{locationText(ctx)}</p>
      <form action={ackFromLink} className="mt-6 space-y-3">
        <input type="hidden" name="token" value={token} />
        <input name="name" placeholder="Your name" className="w-full rounded border p-3 text-lg" />
        <button className="w-full rounded-lg bg-red-600 p-4 text-xl font-bold text-white">I&apos;M RESPONDING</button>
      </form>
      <p className="mt-4 text-sm text-zinc-600">Pressing this tells everyone else someone is on the way.</p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-md p-6">{children}</main>;
}
