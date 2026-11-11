import type { Metadata } from "next";
import { db } from "@/lib/supabase";
import PanicButtons from "./PanicButtons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Firewatch panic button",
  // Lets "Add to Home Screen" open it full screen like an app.
  appleWebApp: { capable: true, title: "Fire alarm", statusBarStyle: "black" },
};

/** Public panic button for one shop or home. Save to the phone's home screen. */
export default async function Panic({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ sent?: string; already?: string; err?: string }>;
}) {
  const { token } = await params;
  const { sent, already, err } = await searchParams;
  const { data: shop } = await db()
    .from("shops")
    .select("shop_number, owner_name, nipost_postcode, markets(name, kind, address)")
    .eq("panic_token", token)
    .maybeSingle();

  if (!shop || err) {
    return <main className="p-6 text-center text-zinc-800">This panic button link is not valid.</main>;
  }
  const m = (shop as unknown as { markets: { name: string; kind: string; address: string | null } | null }).markets;
  const isHome = m?.kind === "home";
  const where = isHome ? `${m?.name}${m?.address ? ` · ${m.address}` : ""}` : `Shop ${shop.shop_number} · ${m?.name}`;

  return (
    <main className="flex min-h-screen flex-col items-center bg-zinc-950 px-5 py-8 text-white">
      <div className="text-sm font-semibold uppercase tracking-widest text-zinc-300">Firewatch · emergency</div>
      <h1 className="mt-1 text-center text-xl font-bold">{where}</h1>
      {shop.nipost_postcode && <div className="mt-1 font-mono text-zinc-200">NIPOST {shop.nipost_postcode}</div>}

      {sent ? (
        <div className="mt-10 w-full max-w-sm rounded-2xl bg-emerald-600 p-6 text-center">
          <div className="text-3xl">✅</div>
          <div className="mt-2 text-xl font-bold">Alert sent</div>
          <p className="mt-2">Your responders are being called and texted now. Get to safety.</p>
        </div>
      ) : already ? (
        <div className="mt-10 w-full max-w-sm rounded-2xl bg-amber-500 p-6 text-center text-zinc-950">
          <div className="text-xl font-bold">An alert is already active</div>
          <p className="mt-2">Your responders have already been alerted. Get to safety.</p>
        </div>
      ) : (
        <PanicButtons token={token} showCo={isHome} />
      )}

      <p className="mt-10 max-w-sm text-center text-sm text-zinc-300">
        Tip: add this page to your home screen (Share → Add to Home Screen) so it opens in one tap. In immediate danger,
        also call 112.
      </p>
    </main>
  );
}
