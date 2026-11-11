"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/supabase";
import { checkPostcode, postcodeColumns } from "@/lib/nipost";
import { asLang } from "@/lib/i18n";
import { acknowledge, handleUplink } from "@/lib/alerts/engine";

const s = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

/** Public: used by the link in the SMS. Token is unguessable, so no login needed. */
export async function ackFromLink(f: FormData) {
  const token = s(f, "token")!;
  const name = s(f, "name") ?? "Someone (via SMS link)";
  const { data } = await db().from("alerts").select("id").eq("ack_token", token).maybeSingle();
  if (data) await acknowledge(data.id, name);
  redirect(`/ack/${token}?done=1`);
}


/**
 * Public: the panic button. Raises a real alert for the shop/home that owns the token,
 * through a per-shop "panic" pseudo-sensor so it uses the normal alert chain.
 */
export async function raisePanic(f: FormData) {
  const token = s(f, "token") ?? "";
  const hazard = s(f, "hazard") === "co" ? "co" : "fire";
  const supa = db();
  const { data: shop } = await supa.from("shops").select("id").eq("panic_token", token).maybeSingle();
  if (!shop) redirect(`/panic/${token}?err=1`);

  const devEui = ("PANIC" + shop!.id.replace(/-/g, "")).slice(0, 16).toUpperCase();
  const { data: existing } = await supa.from("sensors").select("id").eq("dev_eui", devEui).maybeSingle();
  if (!existing) {
    await supa
      .from("sensors")
      .insert({ dev_eui: devEui, shop_id: shop!.id, kind: "panic", label: "Panic button", status: "ok" });
  }
  const r = await handleUplink({
    devEui,
    source: "ttn",
    receivedAt: new Date().toISOString(),
    type: hazard === "co" ? "co_alarm" : "alarm",
    batteryPct: null,
    temperatureC: null,
    coPpm: null,
    gatewayId: null,
    rssi: null,
    decoded: { panic: true },
    raw: null,
  });
  redirect(`/panic/${token}?${r.alert ? "sent=1" : "already=1"}`);
}

function phoneE164(v: string | null): string | null {
  if (!v) return null;
  let p = v.replace(/[\s()-]/g, "");
  if (p.startsWith("0") && p.length === 11) p = "+234" + p.slice(1);
  if (!p.startsWith("+")) p = "+" + p;
  return /^\+\d{8,15}$/.test(p) ? p : null;
}

/** Public: a trader registers their own shop from the market's sign-up link. */
export async function joinMarket(f: FormData) {
  const token = s(f, "token") ?? "";
  const back = (err: string) => redirect(`/join/${token}?err=${encodeURIComponent(err)}`);
  const supa = db();
  const { data: market } = await supa.from("markets").select("id").eq("join_token", token).eq("kind", "market").maybeSingle();
  if (!market) back("This sign-up link is not valid.");

  const ownerPhone = phoneE164(s(f, "owner_phone"));
  const shopNumber = s(f, "shop_number")?.toUpperCase().slice(0, 20);
  const ownerName = s(f, "owner_name")?.slice(0, 80);
  if (!ownerPhone) back("Enter a valid phone number, e.g. 0803 123 4567.");
  if (!shopNumber || !ownerName) back("Enter your name and shop number.");

  const sectionId = s(f, "section_id");
  if (sectionId) {
    const { data: sec } = await supa.from("sections").select("id").eq("id", sectionId).eq("market_id", market!.id).maybeSingle();
    if (!sec) back("Choose your line from the list.");
  }

  const pc = await checkPostcode(s(f, "nipost_postcode"));
  const ins = await supa
    .from("shops")
    .insert({
      ...postcodeColumns(pc),
      market_id: market!.id,
      section_id: sectionId,
      shop_number: shopNumber,
      owner_name: ownerName,
      owner_phone: ownerPhone,
      backup_phone: phoneE164(s(f, "backup_phone")),
      trade: s(f, "trade")?.slice(0, 60) ?? null,
      owner_language: asLang(s(f, "owner_language")),
      self_registered: true,
    })
    .select("panic_token")
    .single();
  if (ins.error) {
    back(
      ins.error.code === "23505"
        ? `Shop ${shopNumber} is already registered. Ask your market office if this is wrong.`
        : "Something went wrong. Please try again.",
    );
  }
  redirect(`/join/${token}/done?p=${ins.data!.panic_token}`);
}
