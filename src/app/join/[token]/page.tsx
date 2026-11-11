import type { Metadata } from "next";
import { db } from "@/lib/supabase";
import { joinMarket } from "@/app/public-actions";
import { LANGS } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Join Firewatch — protect your shop from fire" };

const input = "w-full rounded-lg border border-zinc-400 p-3";

/** Public: trader self sign-up for one market. */
export default async function Join({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { token } = await params;
  const { err } = await searchParams;
  const supa = db();
  const { data: market } = await supa.from("markets").select("id, name, city").eq("join_token", token).eq("kind", "market").maybeSingle();
  if (!market) return <main className="p-6 text-center">This sign-up link is not valid.</main>;
  const { data: sections } = await supa.from("sections").select("id, name").eq("market_id", market.id).order("name");

  return (
    <main className="mx-auto max-w-md px-5 py-8 text-zinc-900">
      <div className="text-sm font-semibold uppercase tracking-widest text-red-700">🔥 Firewatch</div>
      <h1 className="mt-1 text-2xl font-extrabold">Protect your shop at {market.name}</h1>
      <p className="mt-2 text-zinc-800">
        Register once. If there is a fire at your shop, you and the market&apos;s night security get an alert straight
        away, with your shop&apos;s exact location.
      </p>

      {err && <div className="mt-4 rounded-lg bg-red-100 p-3 font-semibold text-red-900">{err}</div>}

      <form action={joinMarket} className="mt-6 space-y-3">
        <input type="hidden" name="token" value={token} />
        <label className="block">
          <span className="font-semibold">Your name</span>
          <input name="owner_name" required className={input} autoComplete="name" />
        </label>
        <label className="block">
          <span className="font-semibold">Phone number</span>
          <input name="owner_phone" required inputMode="tel" placeholder="0803 123 4567" className={input} />
        </label>
        <label className="block">
          <span className="font-semibold">Shop number</span>
          <input name="shop_number" required placeholder="e.g. C14" className={`${input} uppercase placeholder:normal-case`} />
        </label>
        {!!sections?.length && (
          <label className="block">
            <span className="font-semibold">Line / section</span>
            <select name="section_id" className={input}>
              <option value="">Not sure</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
        )}
        <label className="block">
          <span className="font-semibold">What do you sell?</span>
          <input name="trade" placeholder="e.g. fabrics" className={input} />
        </label>
        <label className="block">
          <span className="font-semibold">Second phone (optional)</span>
          <input name="backup_phone" inputMode="tel" className={input} />
        </label>
        <label className="block">
          <span className="font-semibold">Shop&apos;s NIPOST postcode (optional)</span>
          <input name="nipost_postcode" placeholder="e.g. AN-01-A03-FK-01" className={`${input} font-mono uppercase placeholder:normal-case`} />
          <span className="text-sm text-zinc-700">
            Find it at{" "}
            <a href="https://postcode.gov.ng/find" target="_blank" className="underline">
              postcode.gov.ng/find
            </a>
          </span>
        </label>
        <label className="block">
          <span className="font-semibold">Alert language</span>
          <select name="owner_language" className={input}>
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </label>
        <button className="w-full rounded-lg bg-red-600 p-4 text-lg font-bold text-white">Register my shop</button>
        <p className="text-sm text-zinc-700">
          By registering you agree to receive fire safety alerts for your shop. We only use your number for alerts.
        </p>
      </form>
    </main>
  );
}
