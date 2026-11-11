/**
 * End-to-end check of the alert flow with an in-memory database and a fake
 * Africa's Talking: alarm -> alert -> who gets texted/called.
 *   npx tsx --conditions=react-server --require ./scripts/fake/register.cjs scripts/test-alert-flow.ts
 */
import { tables } from "./fake/supabase";

process.env.NOTIFY_MODE = "live";
process.env.AT_USERNAME = "test";
process.env.AT_API_KEY = "k";
process.env.APP_URL = "https://firewatch.test";

let mode: "ok" | "sms-throws" | "call-throws" | "dnd" = "ok";
const sent: string[] = [];
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
  const u = String(url);
  const body = new URLSearchParams(String(init?.body ?? ""));
  if (u.includes("api.telegram.org")) {
    const b = JSON.parse(String(init?.body ?? "{}"));
    sent.push(`TG ${b.chat_id}: ${b.text} [${b.reply_markup?.inline_keyboard?.[0]?.[0]?.text ?? ""}]`);
    return new Response(JSON.stringify({ ok: true, result: { message_id: 9 } }));
  }
  if (u.includes("bulksmsnigeria")) {
    const b = JSON.parse(String(init?.body ?? "{}"));
    sent.push(`BSNG ${b.to} [${b.from}/${b.gateway}]: ${b.body}`);
    return new Response(JSON.stringify({ status: "success", code: "BSNG-0000", data: { message_id: "b1", gateway_used: "direct-corporate" } }));
  }
  if (u.includes("termii")) {
    const b = JSON.parse(String(init?.body ?? "{}"));
    sent.push(`TERMII ${b.to} [${b.channel}]: ${b.sms}`);
    return new Response(JSON.stringify({ message_id: "t1", message: "Successfully Sent" }));
  }
  if (u.includes("messaging")) {
    if (mode === "sms-throws") throw new Error("socket hang up");
    if (mode === "dnd")
      return new Response(JSON.stringify({ SMSMessageData: { Recipients: [{ status: "DoNotDisturbRejection" }] } }));
    sent.push(`SMS ${body.get("to")}: ${body.get("message")}`);
    return new Response(JSON.stringify({ SMSMessageData: { Recipients: [{ status: "Success", messageId: "m1" }] } }));
  }
  if (u.includes("voice")) {
    if (mode === "call-throws") throw new Error("voice down");
    sent.push(`CALL ${body.get("to")}`);
    return new Response(JSON.stringify({ entries: [{ status: "Queued", sessionId: "s1" }] }));
  }
  throw new Error("unexpected fetch " + u);
}) as typeof fetch;

async function main() {
const { handleUplink } = await import("../src/lib/alerts/engine");

function seed() {
  for (const k of Object.keys(tables)) delete tables[k];
  tables.markets = [{ id: "m1", name: "Demo Market", kind: "market" }];
  tables.sections = [{ id: "sec1", market_id: "m1", name: "Line A" }];
  tables.shops = [{ id: "sh1", market_id: "m1", section_id: "sec1", shop_number: "A1", owner_name: "Emeka", owner_phone: "+2348030000000", nipost_postcode: "EK-01-A03-FK-01" }];
  tables.contacts = [{ id: "c1", market_id: "m1", section_id: null, name: "Musa", phone: "+2348031111111", role: "security", tier: 0, active: true }];
  tables.sensors = [{ id: "s1", dev_eui: "AAAA", shop_id: "sh1", status: "ok" }];
}
const drill = () =>
  handleUplink({ devEui: "AAAA", source: "ttn", receivedAt: new Date().toISOString(), type: "alarm", batteryPct: null, temperatureC: null, coPpm: null, gatewayId: null, rssi: null, decoded: {}, raw: null });

let fail = 0;
const check = (label: string, cond: boolean) => { console.log(cond ? "  ✓" : "  ✗", label); if (!cond) fail++; };
const rows = () => tables.alert_attempts ?? [];

for (const [m, voice] of [["ok", ""], ["ok", "+2347000000000"], ["sms-throws", "+2347000000000"], ["call-throws", "+2347000000000"]] as const) {
  seed(); sent.length = 0; mode = m;
  if (voice) process.env.AT_VOICE_NUMBER = voice; else delete process.env.AT_VOICE_NUMBER;
  console.log(`\n${m}, calls ${voice ? "on" : "off"}`);
  const r = await drill();
  const sms = rows().filter((x) => x.channel === "sms");
  const calls = rows().filter((x) => x.channel === "voice");
  check("alert opened", !!r.alert);
  check("a text row for owner and security", sms.length === 2);
  if (m === "sms-throws") check("text rows marked failed with reason", sms.every((x) => x.status === "failed" && x.detail?.errorMessage));
  else check("texts sent", sms.every((x) => x.status === "sent") && sent.filter((x) => x.startsWith("SMS")).length === 2);
  if (!voice) check("no call rows when calls are off", calls.length === 0);
  else if (m === "call-throws") check("call rows failed, texts unaffected", calls.length === 2 && calls.every((x) => x.status === "failed"));
  else check("calls placed", calls.length === 2);
  check("SMS contains NIPOST postcode", m === "sms-throws" || sent.some((x) => x.includes("NIPOST EK-01-A03-FK-01")));
  const second = await drill();
  check("second drill while open does not re-text", second.alert === null && rows().filter((x) => x.channel === "sms").length === 2);
}
// Telegram: SMS blocked by DND, owner has linked Telegram; security shares the same phone
{
  seed(); sent.length = 0; mode = "dnd"; delete process.env.AT_VOICE_NUMBER;
  process.env.TELEGRAM_BOT_TOKEN = "123:abc"; process.env.TELEGRAM_BOT_USERNAME = "FirewatchBot";
  tables.contacts[0].phone = "+2348030000000"; // same number as the owner, like the demo
  tables.telegram_links = [{ phone: "+2348030000000", chat_id: 555 }];
  console.log("\nDND on SMS, Telegram linked");
  const r = await drill();
  const sms = rows().filter((x) => x.channel === "sms");
  const tgRows = rows().filter((x) => x.channel === "telegram");
  check("SMS rows failed with DoNotDisturbRejection", sms.length === 2 && sms.every((x) => x.status === "failed"));
  check("one Telegram message per chat (not per role)", tgRows.length === 1 && tgRows[0].status === "sent");
  const msg = sent.find((x) => x.startsWith("TG 555")) ?? "";
  check("Telegram has postcode and I'M RESPONDING button", msg.includes("NIPOST EK-01-A03-FK-01") && msg.includes("I'M RESPONDING"));
  const { acknowledge } = await import("../src/lib/alerts/engine");
  sent.length = 0;
  await acknowledge(r.alert!.id, "Musa");
  check("responding update goes to Telegram too", sent.some((x) => x.startsWith("TG 555") && x.includes("Musa is responding")));
}
// Telegram reminders until someone responds
{
  seed(); sent.length = 0; mode = "dnd";
  tables.contacts[0].phone = "+2348030000000";
  tables.telegram_links = [{ phone: "+2348030000000", chat_id: 555 }];
  console.log("\nTelegram reminders");
  const { telegramReminders, acknowledge } = await import("../src/lib/alerts/engine");
  const r = await drill();
  const age = (secs: number) => { for (const x of rows()) x.created_at = new Date(Date.now() - secs * 1000).toISOString(); };
  check("no reminder straight away", (await telegramReminders()).length === 0);
  age(61);
  const r1 = await telegramReminders();
  check("reminder 1 after a minute", r1.length === 1 && sent.some((x) => x.includes("STILL NO ONE RESPONDING (1/5)")));
  check("no double reminder in the same minute", (await telegramReminders()).length === 0);
  for (let i = 2; i <= 5; i++) { age(61); await telegramReminders(); }
  check("reminders 2-5 sent", sent.some((x) => x.includes("(5/5)")));
  age(61);
  check("stops after 5", (await telegramReminders()).length === 0);

  seed(); sent.length = 0;
  tables.telegram_links = [{ phone: "+2348030000000", chat_id: 555 }];
  const r2 = await drill();
  await acknowledge(r2.alert!.id, "Musa");
  age(61);
  check("no reminders once someone responds", (await telegramReminders()).length === 0);
  void r;
}
// SMS fallback: Africa's Talking rejects (DND) -> BulkSMSNigeria corporate route delivers
{
  seed(); sent.length = 0; mode = "dnd";
  delete process.env.TELEGRAM_BOT_TOKEN;
  process.env.SMS_PROVIDERS = "africastalking,bulksmsnigeria,termii";
  process.env.BULKSMSNG_TOKEN = "tok"; process.env.BULKSMSNG_FROM = "Firewatch";
  console.log("\nSMS fallback when Africa's Talking hits DND");
  await drill();
  const sms = rows().filter((x) => x.channel === "sms");
  check("texts marked sent via fallback", sms.length === 2 && sms.every((x) => x.status === "sent" && x.detail?.provider === "bulksmsnigeria"));
  check("fallback used corporate route, digits-only number", sent.some((x) => x.startsWith("BSNG 2348030000000 [Firewatch/direct-corporate]")));
  check("termii not needed", !sent.some((x) => x.startsWith("TERMII")));

  seed(); sent.length = 0;
  process.env.SMS_PROVIDERS = "termii,africastalking";
  process.env.TERMII_API_KEY = "k"; process.env.TERMII_FROM = "Firewatch";
  console.log("\nTermii first, dnd channel");
  await drill();
  check("termii used first on dnd channel", sent.filter((x) => x.startsWith("TERMII ") && x.includes("[dnd]")).length === 2 && !sent.some((x) => x.startsWith("SMS ")));
  delete process.env.SMS_PROVIDERS;
}
console.log(fail ? `\n${fail} FAILED` : "\nALL PASS");
if (fail) process.exit(1);
}
main();
