/**
 * Turns a raw webhook body from The Things Network (v3) or ChirpStack (v4)
 * into one shape the rest of the app understands.
 *
 * Every sensor brand names its decoded fields differently. The interpreter below
 * is deliberately forgiving; once you pick a device, check its decoded payload
 * in the TTN console and tighten `interpret()` to match.
 */

export type EventType = "alarm" | "co_alarm" | "alarm_cleared" | "heartbeat" | "tamper" | "test" | "unknown";

export interface NormalisedUplink {
  devEui: string;
  source: "ttn" | "chirpstack" | "device";
  receivedAt: string;
  type: EventType;
  batteryPct: number | null;
  temperatureC: number | null;
  coPpm: number | null;
  gatewayId: string | null;
  rssi: number | null;
  decoded: Record<string, unknown>;
  raw: unknown;
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

export function normalise(body: unknown, heatAlarmC: number, coAlarmPpm = 100): NormalisedUplink | null {
  if (!isObj(body)) return null;

  // --- The Things Network v3 ---
  if (isObj(body.end_device_ids) && isObj(body.uplink_message)) {
    const ids = body.end_device_ids;
    const up = body.uplink_message;
    const rx = Array.isArray(up.rx_metadata) && isObj(up.rx_metadata[0]) ? up.rx_metadata[0] : null;
    const gw = rx && isObj(rx.gateway_ids) ? rx.gateway_ids : null;
    const decoded = isObj(up.decoded_payload) ? up.decoded_payload : {};
    const devEui = String(ids.dev_eui ?? ids.device_id ?? "").toUpperCase();
    if (!devEui) return null;
    return {
      devEui,
      source: "ttn",
      receivedAt: String(body.received_at ?? new Date().toISOString()),
      ...interpret(decoded, heatAlarmC, coAlarmPpm),
      gatewayId: gw ? String(gw.gateway_id ?? gw.eui ?? "") || null : null,
      rssi: rx && typeof rx.rssi === "number" ? rx.rssi : null,
      decoded,
      raw: body,
    };
  }

  // --- ChirpStack v4 HTTP integration ("up" event) ---
  if (isObj(body.deviceInfo)) {
    const decoded = isObj(body.object) ? body.object : {};
    const rx = Array.isArray(body.rxInfo) && isObj(body.rxInfo[0]) ? body.rxInfo[0] : null;
    const devEui = String(body.deviceInfo.devEui ?? "").toUpperCase();
    if (!devEui) return null;
    return {
      devEui,
      source: "chirpstack",
      receivedAt: String(body.time ?? new Date().toISOString()),
      ...interpret(decoded, heatAlarmC, coAlarmPpm),
      gatewayId: rx ? String(rx.gatewayId ?? "") || null : null,
      rssi: rx && typeof rx.rssi === "number" ? rx.rssi : null,
      decoded,
      raw: body,
    };
  }

  return null;
}

/**
 * Direct WiFi/GSM devices (e.g. the ESP32 Firewatch Home unit in /firmware).
 * Body: { device_id, event?, smoke?, co_ppm?, temp?, battery?, rssi? }
 */
export function fromDevice(body: unknown, heatAlarmC: number, coAlarmPpm = 100): NormalisedUplink | null {
  if (!isObj(body)) return null;
  const devEui = String(body.device_id ?? "").toUpperCase();
  if (!devEui) return null;
  const decoded: Json = { ...body };
  delete decoded.device_id;
  // The device decides (it has the calibrated thresholds). Only infer from
  // readings when it doesn't send an event.
  const ev = typeof body.event === "string" ? body.event.toLowerCase() : null;
  const inferred = interpret(decoded, heatAlarmC, coAlarmPpm);
  const EVENTS: Record<string, EventType> = {
    fire: "alarm",
    smoke: "alarm",
    co: "co_alarm",
    test: "test",
    tamper: "tamper",
    heartbeat: "heartbeat",
  };
  const type: EventType = (ev && EVENTS[ev]) || inferred.type;
  return {
    devEui,
    source: "device",
    receivedAt: new Date().toISOString(),
    ...inferred,
    type,
    gatewayId: null,
    rssi: num(body.rssi),
    decoded,
    raw: body,
  };
}

const ALARM_WORDS = ["alarm", "fire", "smoke", "trigger", "triggered", "alert", "1", "true"];
const CLEAR_WORDS = ["normal", "clear", "cleared", "ok", "0", "false", "idle", "silence"];

function flag(v: unknown): "on" | "off" | null {
  if (typeof v === "boolean") return v ? "on" : "off";
  if (typeof v === "number") return v > 0 ? "on" : "off";
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (CLEAR_WORDS.includes(s) || s.includes("clear") || s.includes("normal")) return "off";
    if (ALARM_WORDS.includes(s) || s.includes("alarm")) return "on";
  }
  return null;
}

function num(...vals: unknown[]): number | null {
  for (const v of vals) {
    const n = typeof v === "string" ? Number(v) : v;
    if (typeof n === "number" && Number.isFinite(n)) return n;
  }
  return null;
}

const IS_CO_KEY = /^co($|_)|carbon_?monoxide/i;

function interpret(d: Json, heatAlarmC: number, coAlarmPpm: number) {
  const batteryPct = num(d.battery, d.battery_pct, d.battery_level, d.batteryLevel, d.bat);
  const temperatureC = num(d.temperature, d.temp, d.temperature_c, d.temperatureC);
  const coPpm = num(d.co_ppm, d.co, d.carbon_monoxide, d.coPpm, d.co_concentration);

  let type: EventType = "heartbeat";

  if (flag(d.test) === "on" || flag(d.self_test) === "on") type = "test";
  if (flag(d.tamper) === "on" || flag(d.tamper_status) === "on" || flag(d.removed) === "on") type = "tamper";

  const alarmKeys = Object.keys(d).filter((k) => !IS_CO_KEY.test(k) && /alarm|smoke|fire|heat_status|event/i.test(k));
  const states = alarmKeys.map((k) => flag(d[k])).filter(Boolean);
  if (states.includes("on")) type = "alarm";
  else if (states.length > 0 && states.every((s) => s === "off") && /clear/i.test(JSON.stringify(d)))
    type = "alarm_cleared";

  if (temperatureC !== null && temperatureC >= heatAlarmC) type = "alarm";

  // Carbon monoxide (generator fumes). Fire takes priority if both trigger at once.
  const coFlag = Object.keys(d)
    .filter((k) => IS_CO_KEY.test(k) && /alarm|status|state/i.test(k))
    .some((k) => flag(d[k]) === "on");
  if (type !== "alarm" && (coFlag || (coPpm !== null && coPpm >= coAlarmPpm))) type = "co_alarm";

  return { type, batteryPct, temperatureC, coPpm };
}
