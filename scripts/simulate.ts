/**
 * Sends a fake TTN uplink to your app so you can test without hardware.
 *
 *   npm run simulate -- alarm
 *   npm run simulate -- heartbeat --eui 70B3D57ED0000002 --battery 15
 *   npm run simulate -- alarm --url https://your-app.vercel.app
 *
 * Firewatch Home devices (ID and key from the home page → "Firmware settings"):
 *   npm run simulate -- home-fire --eui A1B2C3D4E5F60718 --key abc123...
 *   npm run simulate -- home-co   --eui A1B2C3D4E5F60718 --key abc123...
 *   npm run simulate -- home-heartbeat --eui ... --key ...
 *
 * Reads INGEST_WEBHOOK_SECRET from .env.local.
 */
import { readFileSync, existsSync } from "fs";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const args = process.argv.slice(2);
const type = args.find((a) => !a.startsWith("--")) ?? "alarm";
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const url = opt("url", "http://localhost:3000").replace(/\/$/, "");
const eui = opt("eui", "70B3D57ED0000001").toUpperCase();
const battery = Number(opt("battery", "87"));
const secret = process.env.INGEST_WEBHOOK_SECRET;
if (!secret && !type.startsWith("home-")) {
  console.error("Set INGEST_WEBHOOK_SECRET in .env.local");
  process.exit(1);
}

const decoded: Record<string, unknown> = { battery, temperature: 29.5 };
if (type === "alarm") decoded.smoke_alarm = "alarm";
if (type === "clear") decoded.smoke_alarm = "normal";
if (type === "heat") decoded.temperature = 68;
if (type === "tamper") decoded.tamper = "triggered";

const body = {
  end_device_ids: { device_id: `sim-${eui.slice(-4).toLowerCase()}`, dev_eui: eui, application_ids: { application_id: "firewatch" } },
  received_at: new Date().toISOString(),
  uplink_message: {
    f_port: 1,
    decoded_payload: decoded,
    rx_metadata: [{ gateway_ids: { gateway_id: "sim-gateway-1" }, rssi: -97, snr: 7.5 }],
  },
};

async function sendHome() {
  const event = type.replace("home-", "");
  const res = await fetch(`${url}/api/device`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Device-Key": opt("key", "") },
    body: JSON.stringify({
      device_id: eui,
      event,
      smoke_raw: event === "fire" ? 2600 : 700,
      co_raw: event === "co" ? 2400 : 500,
      co_ppm: event === "co" ? 300 : 3,
      battery,
      rssi: -58,
    }),
  });
  console.log(res.status, await res.text());
}

async function main() {
  if (type.startsWith("home-")) return sendHome();
  const res = await fetch(`${url}/api/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Webhook-Secret": secret! },
    body: JSON.stringify(body),
  });
  console.log(res.status, await res.text());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
