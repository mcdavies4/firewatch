import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { db } from "@/lib/supabase";
import { safeEqual } from "@/lib/auth/secrets";
import { fromDevice } from "@/lib/ingest/normalise";
import { handleUplink } from "@/lib/alerts/engine";

export const dynamic = "force-dynamic";

/**
 * Direct ingest for WiFi/GSM devices (the ESP32 Firewatch Home unit).
 *
 *   POST /api/device
 *   X-Device-Key: <key shown when the device was added on the home page>
 *   { "device_id": "A1B2C3D4E5F60718", "event": "heartbeat" | "fire" | "co" | "test",
 *     "smoke": 0, "co_ppm": 4, "temp": 29.5, "battery": 92, "rssi": -61 }
 *
 * Each device has its own key, so one leaked key can't fake alarms for other homes.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const uplink = fromDevice(body, env.heatAlarmC(), env.coAlarmPpm());
  if (!uplink) return NextResponse.json({ error: "device_id required" }, { status: 400 });

  const { data: sensor } = await db()
    .from("sensors")
    .select("device_key")
    .eq("dev_eui", uplink.devEui)
    .maybeSingle();
  const key = req.headers.get("x-device-key");
  if (!sensor?.device_key || !safeEqual(key, sensor.device_key)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  try {
    const result = await handleUplink(uplink);
    return NextResponse.json({ ok: true, type: uplink.type, alertId: result.alert?.id ?? null });
  } catch (err) {
    console.error("device ingest failed", err);
    // 500 tells the device to retry.
    return NextResponse.json({ error: "ingest failed" }, { status: 500 });
  }
}
