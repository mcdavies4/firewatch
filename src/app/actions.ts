"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { randomBytes } from "crypto";
import { db } from "@/lib/supabase";
import { acknowledge, closeAlert, handleUplink } from "@/lib/alerts/engine";
import { AUDIT_ITEMS, PASS_MARK } from "@/lib/ui";

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
  await must(
    db().from("shops").insert({
      market_id: s(f, "market_id"),
      section_id: s(f, "section_id"),
      shop_number: s(f, "shop_number"),
      owner_name: s(f, "owner_name"),
      owner_phone: phone(s(f, "owner_phone")),
      backup_phone: phone(s(f, "backup_phone")),
      trade: s(f, "trade"),
      nipost_postcode: s(f, "nipost_postcode"),
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
  const { data: home } = await must(
    supa
      .from("markets")
      .insert({
        kind: "home",
        name: s(f, "name"),
        city: s(f, "city"),
        state: s(f, "state"),
        address: s(f, "address"),
        nipost_postcode: s(f, "nipost_postcode"),
        landmark: s(f, "landmark"),
        lat: num(s(f, "lat")),
        lng: num(s(f, "lng")),
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
      nipost_postcode: s(f, "nipost_postcode"),
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
