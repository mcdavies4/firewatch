"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { randomBytes } from "crypto";
import { db } from "@/lib/supabase";
import { acknowledge, closeAlert, handleUplink } from "@/lib/alerts/engine";
import { AUDIT_ITEMS, PASS_MARK } from "@/lib/ui";
import { checkPostcode, postcodeColumns, postcodeForPin } from "@/lib/nipost";
import { sendSms } from "@/lib/notify/africastalking";
import { explainDelivery } from "@/lib/notify/explain";

/** Server actions are reachable from any page, so admin ones re-check the dashboard login. */
async function requireAdmin() {
  const h = (await headers()).get("authorization");
  const pass = process.env.DASHBOARD_PASSWORD;
  const user = process.env.DASHBOARD_USER ?? "admin";
  if (!pass || !h?.startsWith("Basic ")) throw new Error("Unauthorised");
  const [u, p] = Buffer.from(h.slice(6), "base64").toString().split(":");
  if (u !== user || p !== pass) throw new Error("Unauthorised");
}

const s = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

function phone(v: string | null): string | null {
  if (!v) return null;
  let p = v.replace(/[\s()-]/g, "");
  if (p.startsWith("0") && p.length === 11) p = "+234" + p.slice(1); // 0803... -> +234803...
  if (!p.startsWith("+")) p = "+" + p;
  return p;
}

async function must<T extends { error: unknown }>(p: PromiseLike<T>) {
  const r = await p;
  if (r.error) throw new Error((r.error as { message?: string }).message ?? "Database error");
  return r;
}

// ---------- Setup ----------
export async function createMarket(f: FormData) {
  await requireAdmin();
  await must(db().from("markets").insert({ name: s(f, "name"), city: s(f, "city"), state: s(f, "state") }));
  revalidatePath("/setup");
}

export async function createSection(f: FormData) {
  await requireAdmin();
  await must(db().from("sections").insert({ market_id: s(f, "market_id"), name: s(f, "name") }));
  revalidatePath("/setup");
}

export async function createShop(f: FormData) {
  await requireAdmin();
  const pc = await checkPostcode(s(f, "nipost_postcode"));
  await must(
    db().from("shops").insert({
      ...postcodeColumns(pc),
      market_id: s(f, "market_id"),
      section_id: s(f, "section_id"),
      shop_number: s(f, "shop_number"),
      owner_name: s(f, "owner_name"),
      owner_phone: phone(s(f, "owner_phone")),
      backup_phone: phone(s(f, "backup_phone")),
      trade: s(f, "trade"),
    }),
  );
  revalidatePath("/setup");
  revalidatePath("/dashboard");
}

export async function createContact(f: FormData) {
  await requireAdmin();
  await must(
    db().from("contacts").insert({
      market_id: s(f, "market_id"),
      section_id: s(f, "section_id"),
      name: s(f, "name"),
      phone: phone(s(f, "phone")),
      role: s(f, "role"),
      tier: Number(s(f, "tier") ?? 0),
    }),
  );
  revalidatePath("/setup");
}

export async function toggleContact(f: FormData) {
  await requireAdmin();
  await must(db().from("contacts").update({ active: s(f, "active") === "true" }).eq("id", s(f, "id")));
  revalidatePath("/setup");
}

export async function assignSensor(f: FormData) {
  await requireAdmin();
  const devEui = s(f, "dev_eui")?.toUpperCase().replace(/[^0-9A-F]/g, "");
  if (!devEui || devEui.length !== 16) throw new Error("DevEUI must be 16 hex characters");
  const shopId = s(f, "shop_id");
  await must(
    db()
      .from("sensors")
      .upsert(
        { dev_eui: devEui, shop_id: shopId, kind: s(f, "kind") ?? "smoke", label: s(f, "label"), status: shopId ? "ok" : "unassigned" },
        { onConflict: "dev_eui" },
      ),
  );
  revalidatePath("/setup");
  revalidatePath("/dashboard");
}

// ---------- Alerts ----------
export async function ackFromDashboard(f: FormData) {
  await requireAdmin();
  await acknowledge(s(f, "alert_id")!, s(f, "by") ?? "Control room");
  revalidatePath("/alerts");
  revalidatePath("/dashboard");
}

export async function closeAlertAction(f: FormData) {
  await requireAdmin();
  const outcome = s(f, "outcome") === "false_alarm" ? "false_alarm" : "resolved";
  await closeAlert(s(f, "alert_id")!, outcome, s(f, "note"));
  revalidatePath("/alerts");
  revalidatePath("/dashboard");
}

/** Fires a fake alarm through the real pipeline — for demos and drills. */
export async function testAlarm(f: FormData) {
  await requireAdmin();
  const devEui = s(f, "dev_eui")!;
  const co = s(f, "hazard") === "co";
  const r = await handleUplink({
    devEui,
    source: "ttn",
    receivedAt: new Date().toISOString(),
    type: co ? "co_alarm" : "alarm",
    batteryPct: null,
    temperatureC: null,
    coPpm: co ? 300 : null,
    gatewayId: null,
    rssi: null,
    decoded: co ? { simulated: true, co_ppm: 300 } : { simulated: true, smoke_alarm: "alarm" },
    raw: null,
  });
  redirect(r.alert ? `/alerts/${r.alert.id}` : "/alerts");
}

// ---------- Audits ----------
export async function submitAudit(f: FormData) {
  await requireAdmin();
  const shopId = s(f, "shop_id")!;
  const checklist = Object.fromEntries(AUDIT_ITEMS.map((i) => [i.key, f.get(i.key) === "on"]));
  const score = Math.round((Object.values(checklist).filter(Boolean).length / AUDIT_ITEMS.length) * 100);
  const passed = score >= PASS_MARK;
  const validUntil = new Date();
  validUntil.setFullYear(validUntil.getFullYear() + 1);

  await must(
    db().from("audits").insert({
      shop_id: shopId,
      auditor_name: s(f, "auditor_name") ?? "Auditor",
      checklist,
      score,
      passed,
      notes: s(f, "notes"),
      certificate_code: passed ? "FW-" + randomBytes(4).toString("hex").toUpperCase() : null,
      valid_until: passed ? validUntil.toISOString().slice(0, 10) : null,
    }),
  );
  revalidatePath(`/shops/${shopId}`);
}

// ---------- Firewatch Home ----------
const num = (v: string | null) => (v !== null && Number.isFinite(Number(v)) ? Number(v) : null);

/** A home is a site (markets.kind = 'home') with one household record. */
export async function createHome(f: FormData) {
  await requireAdmin();
  const supa = db();
  const lat = num(s(f, "lat"));
  const lng = num(s(f, "lng"));
  // Postcode typed in → verify it with NIPOST. None typed but a map pin → ask NIPOST for it.
  let pc = await checkPostcode(s(f, "nipost_postcode"));
  if (pc.status === "none" && lat !== null && lng !== null) pc = await postcodeForPin(lat, lng);
  const { data: home } = await must(
    supa
      .from("markets")
      .insert({
        ...postcodeColumns(pc),
        kind: "home",
        name: s(f, "name"),
        city: s(f, "city"),
        state: s(f, "state"),
        address: s(f, "address"),
        landmark: s(f, "landmark"),
        lat,
        lng,
      })
      .select("id")
      .single(),
  );
  await must(
    supa.from("shops").insert({
      market_id: home!.id,
      shop_number: "HOME",
      owner_name: s(f, "owner_name"),
      owner_phone: phone(s(f, "owner_phone")),
      backup_phone: phone(s(f, "backup_phone")),
      nipost_postcode: pc.postcode,
    }),
  );
  revalidatePath("/homes");
  redirect(`/homes/${home!.id}`);
}

export async function addHomeContact(f: FormData) {
  await requireAdmin();
  const homeId = s(f, "market_id")!;
  await must(
    db().from("contacts").insert({
      market_id: homeId,
      name: s(f, "name"),
      phone: phone(s(f, "phone")),
      role: s(f, "role") ?? "family",
      tier: Number(s(f, "tier") ?? 0),
    }),
  );
  revalidatePath(`/homes/${homeId}`);
}

/** Registers an ESP32 unit: generates its ID and secret key to flash into the firmware. */
export async function addHomeDevice(f: FormData) {
  await requireAdmin();
  const homeId = s(f, "market_id")!;
  const { data: household } = await must(
    db().from("shops").select("id").eq("market_id", homeId).eq("shop_number", "HOME").single(),
  );
  await must(
    db().from("sensors").insert({
      dev_eui: randomBytes(8).toString("hex").toUpperCase(),
      device_key: randomBytes(16).toString("hex"),
      shop_id: household!.id,
      kind: s(f, "kind") ?? "smoke_co",
      label: s(f, "label"),
      status: "ok",
    }),
  );
  revalidatePath(`/homes/${homeId}`);
}

/** Re-checks a home's postcode with NIPOST, or sets a new one / finds it from the map pin. */
export async function recheckHomePostcode(f: FormData) {
  await requireAdmin();
  const supa = db();
  const homeId = s(f, "market_id")!;
  const { data: home } = await must(
    supa.from("markets").select("nipost_postcode, lat, lng").eq("id", homeId).single(),
  );
  const typed = s(f, "nipost_postcode");
  const fromPin = s(f, "mode") === "pin";
  let pc = fromPin
    ? await postcodeForPin(Number(home!.lat), Number(home!.lng))
    : await checkPostcode(typed ?? home!.nipost_postcode);
  // A failed pin search keeps the existing postcode, only noting why.
  if (fromPin && pc.status === "none" && home!.nipost_postcode) {
    pc = { ...(await checkPostcode(home!.nipost_postcode)), note: pc.note };
  }
  await must(supa.from("markets").update(postcodeColumns(pc)).eq("id", homeId));
  await must(supa.from("shops").update({ nipost_postcode: pc.postcode }).eq("market_id", homeId).eq("shop_number", "HOME"));
  revalidatePath(`/homes/${homeId}`);
  revalidatePath("/homes");
}

/** Re-checks a market shop's postcode with NIPOST. */
export async function recheckShopPostcode(f: FormData) {
  await requireAdmin();
  const shopId = s(f, "shop_id")!;
  const { data: shop } = await must(db().from("shops").select("nipost_postcode").eq("id", shopId).single());
  const pc = await checkPostcode(s(f, "nipost_postcode") ?? shop!.nipost_postcode);
  await must(db().from("shops").update(postcodeColumns(pc)).eq("id", shopId));
  revalidatePath(`/shops/${shopId}`);
}

// ---------- Demo ----------
const newEui = () => randomBytes(8).toString("hex").toUpperCase();
const newKey = () => randomBytes(16).toString("hex");

/**
 * One click: a demo market (2 lines, 6 shops, a sensor in each) and a demo home
 * (smoke + CO device). Every alert goes to the phone number entered, so you can
 * film the whole thing on your own phone.
 */
export async function createDemo(f: FormData) {
  await requireAdmin();
  const supa = db();
  const myPhone = phone(s(f, "phone"));
  const myName = s(f, "name") ?? "Demo responder";
  if (!myPhone) throw new Error("Enter the phone number that should receive the demo alerts");

  // Market
  const { data: market } = await must(
    supa.from("markets").insert({ kind: "market", name: "Demo Market", city: "Lagos", state: "Lagos" }).select("id").single(),
  );
  const { data: secs } = await must(
    supa
      .from("sections")
      .insert([
        { market_id: market!.id, name: "Line A" },
        { market_id: market!.id, name: "Line B" },
      ])
      .select("id, name"),
  );
  const lineA = secs!.find((x: { name: string }) => x.name === "Line A")!.id;
  const lineB = secs!.find((x: { name: string }) => x.name === "Line B")!.id;
  const shopRows = [
    { shop_number: "A1", trade: "Fabrics", section_id: lineA },
    { shop_number: "A2", trade: "Electronics", section_id: lineA },
    { shop_number: "A3", trade: "Shoes", section_id: lineA },
    { shop_number: "B1", trade: "Foodstuff", section_id: lineB },
    { shop_number: "B2", trade: "Phones", section_id: lineB },
    { shop_number: "B3", trade: "Cosmetics", section_id: lineB },
  ].map((r) => ({ ...r, market_id: market!.id, owner_name: myName, owner_phone: myPhone }));
  const { data: shops } = await must(supa.from("shops").insert(shopRows).select("id, shop_number"));
  await must(
    supa.from("sensors").insert(
      shops!.map((sh: { id: string; shop_number: string }) => ({
        dev_eui: newEui(),
        device_key: newKey(),
        shop_id: sh.id,
        kind: "smoke_heat",
        label: `Shop ${sh.shop_number}`,
        status: "ok",
        battery_pct: 95,
        last_seen_at: new Date().toISOString(),
      })),
    ),
  );

  // Home
  const pc = await checkPostcode(s(f, "postcode"));
  const { data: home } = await must(
    supa
      .from("markets")
      .insert({
        ...postcodeColumns(pc),
        kind: "home",
        name: "Demo Home",
        city: "Enugu",
        state: "Enugu",
        address: "12 Demo Close, Independence Layout",
        landmark: "opposite the filling station",
      })
      .select("id")
      .single(),
  );
  const { data: household } = await must(
    supa
      .from("shops")
      .insert({ market_id: home!.id, shop_number: "HOME", owner_name: myName, owner_phone: myPhone, nipost_postcode: pc.postcode })
      .select("id")
      .single(),
  );
  await must(
    supa.from("sensors").insert([
      { dev_eui: newEui(), device_key: newKey(), shop_id: household!.id, kind: "smoke_co", label: "Generator room", status: "ok", battery_pct: 92, last_seen_at: new Date().toISOString() },
      { dev_eui: newEui(), device_key: newKey(), shop_id: household!.id, kind: "smoke", label: "Kitchen", status: "ok", battery_pct: 88, last_seen_at: new Date().toISOString() },
    ]),
  );

  revalidatePath("/demo");
  revalidatePath("/dashboard");
  revalidatePath("/homes");
  redirect("/demo");
}

/** Gives a sensor (e.g. a LoRaWAN market sensor) a key so it can be driven from the virtual sensor page. */
export async function enableVirtualSensor(f: FormData) {
  await requireAdmin();
  await must(db().from("sensors").update({ device_key: newKey() }).eq("id", s(f, "sensor_id")!).is("device_key", null));
  revalidatePath("/demo");
}

/** Closes every open alert, so the next drill sends fresh texts. */
export async function closeAllAlerts() {
  await requireAdmin();
  const { data } = await db().from("alerts").select("id").in("status", ["open", "acknowledged"]);
  for (const a of data ?? []) await closeAlert(a.id, "false_alarm", "Demo reset");
  revalidatePath("/demo");
  revalidatePath("/dashboard");
  revalidatePath("/homes");
}

/** Sends one SMS straight through Africa's Talking and reports the raw result on the Demo page. */
export async function sendTestSms(f: FormData) {
  await requireAdmin();
  const to = phone(s(f, "phone"));
  if (!to) redirect("/demo?sms=failed&why=" + encodeURIComponent("Enter a phone number"));
  const r = await sendSms(to!, "Firewatch test: if you can read this, alert texts are working.");
  const why = r.status === "sent" ? `Sent to ${to}` : r.status === "logged" ? "Test mode: NOTIFY_MODE is not \"live\", so nothing was sent" : explainDelivery(r.detail);
  redirect(`/demo?sms=${r.status}&why=${encodeURIComponent(why)}#delivery`);
}
