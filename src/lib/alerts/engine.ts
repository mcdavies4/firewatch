import "server-only";
import { db } from "../supabase";
import { env } from "../env";
import { placeCall, voiceEnabled, type SendResult } from "../notify/africastalking";
import { sendSms } from "../notify/sms";
import { sendTelegram, telegramEnabled } from "../notify/telegram";
import type { NormalisedUplink } from "../ingest/normalise";
import { asLang, WORDS, type Lang } from "../i18n";

// ---------- Types ----------
interface AlertRow {
  id: string;
  sensor_id: string;
  shop_id: string | null;
  market_id: string | null;
  section_id: string | null;
  status: "open" | "acknowledged" | "resolved" | "false_alarm";
  current_tier: number;
  next_escalation_at: string | null;
  ack_token: string;
  hazard: "fire" | "co";
  source?: string;
  is_drill?: boolean;
}

export interface AlertContext {
  alert: AlertRow;
  shopNumber: string;
  ownerName: string;
  ownerPhone: string;
  backupPhone: string | null;
  sectionName: string | null;
  marketName: string;
  kind: "market" | "home";
  hazard: "fire" | "co";
  address: string | null;
  postcode: string | null;
  postcodeStatus: string | null;
  postcodeArea: string | null;
  landmark: string | null;
  lat: number | null;
  lng: number | null;
  source: "sensor" | "panic";
  isDrill: boolean;
  ownerLanguage: Lang;
  /** For matching the nearest fire station. */
  state: string | null;
  lga: string | null;
}

interface Recipient {
  name: string;
  phone: string;
  role: string;
  lang: Lang;
}

// ---------- Ingest ----------
export async function handleUplink(u: NormalisedUplink) {
  const supa = db();

  let { data: sensor } = await supa.from("sensors").select("*").eq("dev_eui", u.devEui).maybeSingle();
  if (!sensor) {
    // Unknown device: register it as unassigned so it shows up in Setup.
    const ins = await supa
      .from("sensors")
      .insert({ dev_eui: u.devEui, status: "unassigned" })
      .select("*")
      .single();
    if (ins.error) throw ins.error;
    sensor = ins.data;
  }

  await supa.from("sensor_events").insert({
    sensor_id: sensor.id,
    dev_eui: u.devEui,
    type: u.type,
    payload: { decoded: u.decoded, source: u.source, gateway: u.gatewayId, rssi: u.rssi },
    received_at: u.receivedAt,
  });

  if (u.gatewayId) {
    await supa
      .from("gateways")
      .upsert({ gateway_id: u.gatewayId, last_seen_at: u.receivedAt }, { onConflict: "gateway_id" });
  }

  const status = nextSensorStatus(sensor.status, sensor.shop_id, u);
  await supa
    .from("sensors")
    .update({
      status,
      last_seen_at: u.receivedAt,
      battery_pct: u.batteryPct ?? sensor.battery_pct,
      temperature_c: u.temperatureC ?? sensor.temperature_c,
      co_ppm: u.coPpm ?? sensor.co_ppm,
      last_gateway: u.gatewayId ?? sensor.last_gateway,
      last_rssi: u.rssi ?? sensor.last_rssi,
    })
    .eq("id", sensor.id);

  if ((u.type === "alarm" || u.type === "co_alarm") && sensor.shop_id) {
    const hazard = u.type === "co_alarm" ? "co" : "fire";
    const d = (u.decoded ?? {}) as { simulated?: unknown; virtual?: unknown; drill?: unknown };
    const isDrill = !!(d.simulated || d.virtual || d.drill);
    const source = sensor.kind === "panic" ? "panic" : "sensor";
    return { sensorId: sensor.id, alert: await openAlert(sensor.id, sensor.shop_id, hazard, { source, isDrill }) };
  }
  return { sensorId: sensor.id, alert: null };
}

function nextSensorStatus(current: string, shopId: string | null, u: NormalisedUplink): string {
  if (!shopId) return "unassigned";
  if (u.type === "alarm" || u.type === "co_alarm") return "alarm";
  if (u.type === "tamper") return "tamper";
  if (current === "alarm") return "alarm"; // stays red until a human resolves the alert
  if (u.batteryPct !== null && u.batteryPct <= env.lowBatteryPct()) return "low_battery";
  return "ok";
}

// ---------- Alerts ----------
async function openAlert(
  sensorId: string,
  shopId: string,
  hazard: "fire" | "co",
  opts: { source: string; isDrill: boolean } = { source: "sensor", isDrill: false },
) {
  const supa = db();
  const { data: shop } = await supa.from("shops").select("market_id, section_id").eq("id", shopId).single();

  const ins = await supa
    .from("alerts")
    .insert({
      sensor_id: sensorId,
      shop_id: shopId,
      market_id: shop?.market_id,
      section_id: shop?.section_id,
      hazard,
      source: opts.source,
      is_drill: opts.isDrill,
    })
    .select("*")
    .single();

  if (ins.error) {
    // 23505 = an alert is already open for this sensor; don't spam people again.
    if (ins.error.code === "23505") return null;
    throw ins.error;
  }
  await notifyTier(ins.data.id, 0);
  return ins.data as AlertRow;
}

export async function getAlertContext(alertId: string): Promise<AlertContext | null> {
  const { data } = await db()
    .from("alerts")
    .select(
      "*, shops(shop_number, owner_name, owner_phone, backup_phone, owner_language, nipost_postcode, postcode_status, postcode_lga, postcode_state), sections(name), markets(name, kind, state, address, nipost_postcode, postcode_status, postcode_lga, postcode_state, landmark, lat, lng)",
    )
    .eq("id", alertId)
    .maybeSingle();
  if (!data) return null;
  return {
    alert: data as AlertRow,
    shopNumber: data.shops?.shop_number ?? "?",
    ownerName: data.shops?.owner_name ?? "Shop owner",
    ownerPhone: data.shops?.owner_phone ?? "",
    backupPhone: data.shops?.backup_phone ?? null,
    sectionName: data.sections?.name ?? null,
    marketName: data.markets?.name ?? "the market",
    kind: data.markets?.kind === "home" ? "home" : "market",
    hazard: data.hazard === "co" ? "co" : "fire",
    address: data.markets?.address ?? null,
    // Homes: the home's postcode. Markets: the shop's own building postcode.
    ...(() => {
      const src = data.markets?.kind === "home" ? data.markets : data.shops;
      return {
        postcode: src?.nipost_postcode ?? null,
        postcodeStatus: src?.postcode_status ?? null,
        postcodeArea: [src?.postcode_lga && `${src.postcode_lga} LGA`, src?.postcode_state].filter(Boolean).join(", ") || null,
        state: src?.postcode_state ?? data.markets?.state ?? null,
        lga: src?.postcode_lga ?? null,
      };
    })(),
    landmark: data.markets?.landmark ?? null,
    lat: data.markets?.lat ?? null,
    lng: data.markets?.lng ?? null,
    source: data.source === "panic" ? "panic" : "sensor",
    isDrill: !!data.is_drill,
    ownerLanguage: asLang(data.shops?.owner_language),
  };
}

async function recipientsForTier(ctx: AlertContext, tier: number): Promise<Recipient[]> {
  const out: Recipient[] = [];
  if (tier === 0) {
    const lang = ctx.ownerLanguage;
    if (ctx.ownerPhone) out.push({ name: ctx.ownerName, phone: ctx.ownerPhone, role: "owner", lang });
    if (ctx.backupPhone) out.push({ name: `${ctx.ownerName} (backup)`, phone: ctx.backupPhone, role: "owner", lang });
  }
  if (tier === stationTier()) {
    for (const st of await stationsFor(ctx)) out.push({ name: st.name, phone: st.phone, role: "fire_service", lang: "en" });
  }
  let q = db()
    .from("contacts")
    .select("name, phone, role, section_id, language")
    .eq("market_id", ctx.alert.market_id)
    .eq("tier", tier)
    .eq("active", true)
    .neq("role", "technician"); // technicians get health digests, not fire calls
  q = ctx.alert.section_id
    ? q.or(`section_id.is.null,section_id.eq.${ctx.alert.section_id}`)
    : q.is("section_id", null);
  const { data } = await q;
  for (const c of data ?? []) out.push({ name: c.name, phone: c.phone, role: c.role, lang: asLang(c.language) });
  return out;
}

/** Tier at which the nearest fire station is called (after owner/security and marshals have had a chance). */
const stationTier = () => Number(process.env.FIRE_STATION_TIER ?? 2);

const norm = (v: string | null | undefined) =>
  (v ?? "").toLowerCase().replace(/\b(state|lga|local government area|fct)\b/g, "").replace(/[^a-z]/g, "");

/** Fire stations for the alert's LGA; if none are listed for that LGA, the state-wide ones. */
export async function stationsFor(ctx: Pick<AlertContext, "state" | "lga">) {
  if (!ctx.state && !ctx.lga) return [];
  const { data } = await db().from("fire_stations").select("name, phone, state, lga").eq("active", true);
  const all = (data ?? []) as { name: string; phone: string; state: string; lga: string | null }[];
  const inState = all.filter((s) => norm(s.state) === norm(ctx.state));
  const inLga = ctx.lga ? inState.filter((s) => s.lga && norm(s.lga) === norm(ctx.lga)) : [];
  return inLga.length ? inLga : inState.filter((s) => !s.lga);
}

async function highestTier(marketId: string | null, ctx?: AlertContext): Promise<number> {
  if (!marketId) return 0;
  if (ctx && (await stationsFor(ctx)).length) {
    const contactsMax = await highestTier(marketId);
    return Math.max(contactsMax, stationTier());
  }
  const { data } = await db()
    .from("contacts")
    .select("tier")
    .eq("market_id", marketId)
    .eq("active", true)
    .neq("role", "technician")
    .order("tier", { ascending: false })
    .limit(1);
  return data?.[0]?.tier ?? 0;
}

export function locationText(ctx: AlertContext) {
  if (ctx.kind === "home") {
    return [
      ctx.marketName,
      ctx.address,
      ctx.postcode && `NIPOST ${ctx.postcode}`,
      ctx.landmark && `near ${ctx.landmark}`,
    ]
      .filter(Boolean)
      .join(", ");
  }
  return [`Shop ${ctx.shopNumber}`, ctx.sectionName, ctx.marketName, ctx.postcode && `NIPOST ${ctx.postcode}`]
    .filter(Boolean)
    .join(", ");
}

export function mapUrl(ctx: AlertContext): string | null {
  return ctx.lat !== null && ctx.lng !== null ? `https://maps.google.com/?q=${ctx.lat},${ctx.lng}` : null;
}

export function hazardTitle(ctx: AlertContext, lang: Lang = "en") {
  const w = WORDS[lang];
  const title = ctx.hazard === "co" ? w.co : ctx.source === "panic" ? w.panic : w.fire;
  return ctx.isDrill ? `${w.drill} - ${title}` : title;
}

/** One line of what to do, shown in SMS and on the ack page. */
export function hazardAdvice(ctx: AlertContext, lang: Lang = "en") {
  const w = WORDS[lang];
  return ctx.hazard === "co" ? w.adviceCo : ctx.kind === "home" ? w.adviceFireHome : w.adviceFireMarket;
}

/** The alert SMS in one person's language. */
export function smsText(ctx: AlertContext, lang: Lang, ackUrl: string, map: string | null) {
  const w = WORDS[lang];
  const sensorFire = ctx.hazard === "fire" && ctx.source !== "panic";
  return (
    `${hazardTitle(ctx, lang)}${sensorFire ? `: ${w.smokeHeat}` : ""} ${w.at} ${locationText(ctx)}. ` +
    `${hazardAdvice(ctx, lang)} ` +
    (map ? `Map: ${map} ` : "") +
    `${w.confirm} ${ackUrl}`
  );
}

function telegramText(ctx: AlertContext, lang: Lang, map: string | null) {
  const w = WORDS[lang];
  const sensorFire = ctx.hazard === "fire" && ctx.source !== "panic";
  return (
    `${ctx.hazard === "co" ? "☠️" : "🔥"} ${hazardTitle(ctx, lang)}${sensorFire ? ` — ${w.smokeHeat}` : ""}\n\n` +
    `📍 ${locationText(ctx)}\n` +
    (ctx.postcode ? `📮 NIPOST ${ctx.postcode}${ctx.postcodeStatus === "verified" ? " ✓" : ""}\n` : "") +
    (map ? `🗺 ${map}\n` : "") +
    `\n${hazardAdvice(ctx, lang)}`
  );
}

export function voiceScript(ctx: AlertContext) {
  if (ctx.kind === "home") {
    const where = [ctx.marketName, ctx.address, ctx.landmark && `near ${ctx.landmark}`].filter(Boolean).join(", ");
    return ctx.hazard === "co"
      ? `Danger. Carbon monoxide detected at ${where}. Get everyone out now. Open the doors and windows and switch off the generator. Do not go back inside. Press 1 if you are responding.`
      : `Fire alert. Fire alert. Smoke or heat detected at ${where}. Get everyone out and call 112. Press 1 if you are responding.`;
  }
  const shop = ctx.shopNumber.split("").join(" "); // "A12" -> "A 1 2" so it's read clearly
  return ctx.hazard === "co"
    ? `Danger. Carbon monoxide detected at shop ${shop}, ${ctx.sectionName ?? ""}, ${ctx.marketName}. Switch off the generator and keep people out. Press 1 if you are responding.`
    : `Fire alert. Fire alert. Smoke or heat detected at shop ${shop}, ${ctx.sectionName ?? ""}, ${ctx.marketName}. Go now. Press 1 if you are responding.`;
}

/** Calls + texts everyone in a tier, then schedules the next tier. */
export async function notifyTier(alertId: string, tier: number) {
  const supa = db();
  const ctx = await getAlertContext(alertId);
  if (!ctx || ctx.alert.status !== "open") return;

  const recipients = await recipientsForTier(ctx, tier);
  console.log(
    `[firewatch-alert] alert=${alertId} tier=${tier} recipients=${recipients.length} mode=${env.notifyMode()} sender=${process.env.AT_SMS_SENDER || "default"}`,
  );
  const ackUrl = `${env.appUrl()}/ack/${ctx.alert.ack_token}`;
  const map = mapUrl(ctx);

  // Texts go first and never wait on (or fail because of) the call. Telegram runs alongside.
  await Promise.allSettled([
    ...recipients.map((r) => contactOne(alertId, tier, r, smsText(ctx, r.lang, ackUrl, map))),
    telegramTier(alertId, tier, recipients, ctx, ackUrl, map),
  ]);

  const maxTier = await highestTier(ctx.alert.market_id, ctx);
  const next = tier < maxTier ? new Date(Date.now() + env.escalationSeconds() * 1000).toISOString() : null;
  await supa.from("alerts").update({ current_tier: tier, next_escalation_at: next }).eq("id", alertId);
}

/** Sends the alert on Telegram to every recipient phone that has linked a Telegram chat (once per chat). */
async function telegramTier(
  alertId: string,
  tier: number,
  recipients: Recipient[],
  ctx: AlertContext,
  ackUrl: string,
  map: string | null,
) {
  if (!telegramEnabled() || !recipients.length) return;
  const supa = db();
  const phones = [...new Set(recipients.map((r) => r.phone))];
  const { data: links } = await supa.from("telegram_links").select("phone, chat_id").in("phone", phones);
  const byChat = new Map<number, Recipient[]>();
  for (const l of links ?? []) {
    const list = byChat.get(l.chat_id) ?? [];
    list.push(...recipients.filter((r) => r.phone === l.phone));
    byChat.set(l.chat_id, list);
  }
  await Promise.allSettled(
    [...byChat.entries()].map(async ([chatId, rs]) => {
      const lang = rs[0].lang;
      const res = await sendTelegram(chatId, telegramText(ctx, lang, map), { text: `🚨 ${WORDS[lang].button}`, url: ackUrl });
      console.log(`[firewatch-telegram] alert=${alertId} chat=${chatId} status=${res.status}`);
      await supa.from("alert_attempts").insert({
        alert_id: alertId,
        tier,
        contact_name: [...new Set(rs.map((r) => r.name))].join(", "),
        contact_phone: rs[0].phone,
        role: [...new Set(rs.map((r) => r.role))].join(", "),
        channel: "telegram",
        provider_ref: res.ref,
        status: res.status,
        detail: { ...(res.detail as object), lang },
      });
    }),
  );
}

/** sendSms that logs instead of throwing, for follow-up messages. */
const safeSms = (to: string, msg: string) => sendSms(to, msg).catch((e) => failed(e));

const failed = (err: unknown): SendResult => ({
  ok: false,
  ref: null,
  status: "failed",
  detail: { errorMessage: err instanceof Error ? err.message : String(err) },
});

/** Texts one person, and calls them if calls are switched on. Records both; never throws. */
async function contactOne(alertId: string, tier: number, r: Recipient, sms: string) {
  const supa = db();
  const base = { alert_id: alertId, tier, contact_name: r.name, contact_phone: r.phone, role: r.role };

  const text = async () => {
    const { data: row } = await supa
      .from("alert_attempts")
      .insert({ ...base, channel: "sms", status: "queued", detail: { lang: r.lang } })
      .select("id")
      .single();
    const res = await sendSms(r.phone, sms).catch(failed);
    console.log(
      `[firewatch-sms] alert=${alertId} to=${r.phone} (${r.name}) status=${res.status} detail=${JSON.stringify(res.detail ?? null).slice(0, 300)}`,
    );
    if (row) {
      await supa
        .from("alert_attempts")
        .update({ provider_ref: res.ref, status: res.status, detail: { ...((res.detail as object) ?? {}), lang: r.lang } })
        .eq("id", row.id);
    }
  };

  const call = async () => {
    // No voice number yet: texts only, and no confusing "call" row.
    if (env.notifyMode() === "live" && !voiceEnabled()) return;
    const { data: row } = await supa
      .from("alert_attempts")
      .insert({ ...base, channel: "voice", status: "queued" })
      .select("id")
      .single();
    const res = await placeCall(r.phone, row?.id ?? alertId).catch(failed);
    if (row) {
      await supa
        .from("alert_attempts")
        .update({ provider_ref: res.ref, status: res.status, detail: res.detail as object })
        .eq("id", row.id);
    }
  };

  const results = await Promise.allSettled([text(), call()]);
  for (const x of results) if (x.status === "rejected") console.error("contact failed", r.phone, x.reason);
}

const REMINDER_SECONDS = () => Number(process.env.TELEGRAM_REMINDER_SECONDS ?? 60);
const MAX_REMINDERS = () => Number(process.env.TELEGRAM_MAX_REMINDERS ?? 5);

/**
 * Called every minute by cron: while nobody has pressed I'M RESPONDING, re-send the
 * Telegram alert to everyone who got it (every minute, up to 5 times) so phones keep buzzing.
 */
export async function telegramReminders() {
  if (!telegramEnabled()) return [];
  const supa = db();
  const { data: open } = await supa.from("alerts").select("id").eq("status", "open");
  const done: { id: string; round: number }[] = [];
  for (const a of open ?? []) {
    const { data: rows } = await supa
      .from("alert_attempts")
      .select("role, contact_name, created_at, detail, status")
      .eq("alert_id", a.id)
      .eq("channel", "telegram");
    if (!rows?.length) continue;
    const originals = rows.filter((r) => r.role !== "reminder" && r.status === "sent");
    const chatLang = new Map<number, Lang>();
    for (const r of originals) {
      const d = r.detail as { chat_id?: number; lang?: string } | null;
      if (d?.chat_id && !chatLang.has(d.chat_id)) chatLang.set(d.chat_id, asLang(d.lang));
    }
    const chats = [...chatLang.keys()];
    if (!chats.length) continue;
    const round = new Set(rows.filter((r) => r.role === "reminder").map((r) => r.contact_name)).size;
    const last = Math.max(...rows.map((r) => new Date(r.created_at).getTime()));
    if (round >= MAX_REMINDERS() || Date.now() - last < REMINDER_SECONDS() * 1000 - 5000) continue;

    const ctx = await getAlertContext(a.id);
    if (!ctx || ctx.alert.status !== "open") continue;
    const n = round + 1;
    const map = mapUrl(ctx);
    const ackUrl = `${env.appUrl()}/ack/${ctx.alert.ack_token}`;
    await Promise.allSettled(
      chats.map(async (chatId) => {
        const lang = chatLang.get(chatId) ?? "en";
        const text = `⏰ ${WORDS[lang].reminder} (${n}/${MAX_REMINDERS()})\n\n${telegramText(ctx, lang, map)}`;
        const res = await sendTelegram(chatId, text, { text: `🚨 ${WORDS[lang].button}`, url: ackUrl });
        await supa.from("alert_attempts").insert({
          alert_id: a.id,
          tier: ctx.alert.current_tier,
          contact_name: `Reminder ${n}`,
          contact_phone: "",
          role: "reminder",
          channel: "telegram",
          provider_ref: res.ref,
          status: res.status,
          detail: { ...(res.detail as object), lang },
        });
      }),
    );
    console.log(`[firewatch-telegram] reminder ${n} alert=${a.id} chats=${chats.length}`);
    done.push({ id: a.id, round: n });
  }
  return done;
}

/** Called every minute by cron: moves unacknowledged alerts up the chain. */
export async function escalateDue() {
  const supa = db();
  const { data: due } = await supa
    .from("alerts")
    .select("id, current_tier")
    .eq("status", "open")
    .not("next_escalation_at", "is", null)
    .lte("next_escalation_at", new Date().toISOString());

  const results: { id: string; tier: number }[] = [];
  for (const a of due ?? []) {
    // Claim the alert so two overlapping cron runs can't both escalate it.
    const { data: claimed } = await supa
      .from("alerts")
      .update({ next_escalation_at: null })
      .eq("id", a.id)
      .eq("current_tier", a.current_tier)
      .not("next_escalation_at", "is", null)
      .select("id");
    if (!claimed?.length) continue;
    await notifyTier(a.id, a.current_tier + 1);
    results.push({ id: a.id, tier: a.current_tier + 1 });
  }
  return results;
}

export async function acknowledge(alertId: string, by: string) {
  const supa = db();
  const { data } = await supa
    .from("alerts")
    .update({
      status: "acknowledged",
      acknowledged_by: by,
      acknowledged_at: new Date().toISOString(),
      next_escalation_at: null,
    })
    .eq("id", alertId)
    .eq("status", "open")
    .select("id");
  if (!data?.length) return false; // already acknowledged / closed

  // Tell everyone already contacted that someone is on it.
  const ctx = await getAlertContext(alertId);
  const { data: attempts } = await supa
    .from("alert_attempts")
    .select("contact_phone, detail")
    .eq("alert_id", alertId)
    .eq("channel", "sms");
  const phoneLang = new Map<string, Lang>();
  for (const a of attempts ?? []) {
    if (!phoneLang.has(a.contact_phone)) phoneLang.set(a.contact_phone, asLang((a.detail as { lang?: string } | null)?.lang));
  }
  const { data: tgAttempts } = await supa
    .from("alert_attempts")
    .select("detail")
    .eq("alert_id", alertId)
    .eq("channel", "telegram")
    .eq("status", "sent");
  const chatLang = new Map<number, Lang>();
  for (const a of tgAttempts ?? []) {
    const d = a.detail as { chat_id?: number; lang?: string } | null;
    if (d?.chat_id && !chatLang.has(d.chat_id)) chatLang.set(d.chat_id, asLang(d.lang));
  }
  if (ctx) {
    const update = (lang: Lang) =>
      `${WORDS[lang].update}: ${WORDS[lang].responding(by, ctx.hazard, locationText(ctx))}`;
    await Promise.allSettled([
      ...[...phoneLang.entries()].map(([p, lang]) => safeSms(p, update(lang))),
      ...[...chatLang.entries()].map(([c, lang]) => sendTelegram(c, `✅ ${update(lang)}`)),
    ]);
  }
  return true;
}

export async function closeAlert(alertId: string, outcome: "resolved" | "false_alarm", note: string | null) {
  const supa = db();
  const { data } = await supa
    .from("alerts")
    .update({ status: outcome, resolved_at: new Date().toISOString(), resolution_note: note, next_escalation_at: null })
    .eq("id", alertId)
    .in("status", ["open", "acknowledged"])
    .select("sensor_id")
    .maybeSingle();
  if (data?.sensor_id) {
    await supa.from("sensors").update({ status: "ok" }).eq("id", data.sensor_id).eq("status", "alarm");
  }
}

// ---------- Health ----------
/** Marks silent sensors offline and texts technicians about anything that newly needs attention. */
export async function runHealthCheck() {
  const supa = db();
  const cutoff = new Date(Date.now() - env.offlineMinutes() * 60_000).toISOString();

  const { data: wentOffline } = await supa
    .from("sensors")
    .update({ status: "offline" })
    .in("status", ["ok", "low_battery"])
    .lt("last_seen_at", cutoff)
    .select("id, dev_eui, label, shops(shop_number, market_id, owner_phone, markets(name, kind))");

  const items = (wentOffline ?? []) as unknown as {
    dev_eui: string;
    label: string | null;
    shops: {
      shop_number: string;
      market_id: string;
      owner_phone: string;
      markets: { name: string; kind: string } | null;
    } | null;
  }[];

  const byMarket = new Map<string, string[]>();
  for (const s of items) {
    const m = s.shops?.market_id;
    if (!m) continue;
    // Homes have no technician: tell the household directly.
    if (s.shops?.markets?.kind === "home") {
      await safeSms(
        s.shops.owner_phone,
        `Firewatch: your alarm${s.label ? ` (${s.label})` : ""} at ${s.shops.markets.name} has gone offline. Please check its power and WiFi.`,
      );
      continue;
    }
    const list = byMarket.get(m) ?? [];
    list.push(s.shops?.shop_number ?? s.label ?? s.dev_eui);
    byMarket.set(m, list);
  }

  for (const [marketId, shops] of byMarket) {
    const { data: techs } = await supa
      .from("contacts")
      .select("phone")
      .eq("market_id", marketId)
      .eq("role", "technician")
      .eq("active", true);
    const msg = `Firewatch: ${shops.length} sensor(s) offline — shops ${shops.slice(0, 15).join(", ")}${shops.length > 15 ? "…" : ""}. Please check batteries/placement.`;
    await Promise.all((techs ?? []).map((t) => safeSms(t.phone, msg)));
  }

  return { offline: items.length };
}
