import { db } from "@/lib/supabase";
import { env } from "@/lib/env";
import { linkUrl, telegramEnabled } from "@/lib/notify/telegram";

export const dynamic = "force-dynamic";

/** After a trader registers: their panic button and Telegram link. */
export default async function JoinDone({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const { data: shop } = p
    ? await db().from("shops").select("shop_number, owner_phone, nipost_postcode, postcode_status, panic_token").eq("panic_token", p).maybeSingle()
    : { data: null };
  if (!shop) return <main className="p-6 text-center">Registration not found.</main>;
  const panic = `${env.appUrl()}/panic/${shop.panic_token}`;

  return (
    <main className="mx-auto max-w-md px-5 py-8 text-zinc-900">
      <div className="rounded-xl bg-emerald-600 p-5 text-white">
        <div className="text-3xl">✅</div>
        <h1 className="mt-1 text-2xl font-extrabold">Shop {shop.shop_number} is registered</h1>
        <p className="mt-1">Fire alerts for your shop will go to {shop.owner_phone}.</p>
        {shop.nipost_postcode && (
          <p className="mt-1 font-mono">
            NIPOST {shop.nipost_postcode} {shop.postcode_status === "verified" ? "✓" : ""}
          </p>
        )}
      </div>

      <section className="mt-6 rounded-xl border-2 border-red-700 p-5">
        <h2 className="text-lg font-bold">🆘 Your panic button</h2>
        <p className="mt-1 text-zinc-800">
          Save this to your home screen. If you see fire, tap it twice and everyone on your shop&apos;s alert list is
          alerted at once.
        </p>
        <a href={panic} className="mt-3 block rounded-lg bg-red-600 p-4 text-center text-lg font-bold text-white">
          Open my panic button
        </a>
        <p className="mt-2 text-sm text-zinc-700">
          iPhone: open it, tap Share → Add to Home Screen. Android: open it, tap ⋮ → Add to Home screen.
        </p>
      </section>

      {telegramEnabled() && (
        <section className="mt-4 rounded-xl border-2 border-sky-700 p-5">
          <h2 className="text-lg font-bold">✈️ Get alerts on Telegram too</h2>
          <p className="mt-1 text-zinc-800">Telegram alerts still arrive if your line blocks business texts (DND).</p>
          <a
            href={linkUrl(shop.owner_phone)}
            className="mt-3 block rounded-lg bg-sky-700 p-4 text-center text-lg font-bold text-white"
          >
            Connect Telegram
          </a>
        </section>
      )}
    </main>
  );
}
