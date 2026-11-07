import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/auth/secrets";
import { normalise } from "@/lib/ingest/normalise";
import { handleUplink } from "@/lib/alerts/engine";

export const dynamic = "force-dynamic";

/**
 * Webhook for The Things Network (v3) and ChirpStack (v4).
 * Authenticate with header `X-Webhook-Secret: <INGEST_WEBHOOK_SECRET>`
 * (or `?secret=` if your network server can't set headers).
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const secret = req.headers.get("x-webhook-secret") ?? url.searchParams.get("secret");
  if (!safeEqual(secret, env.webhookSecret())) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  // ChirpStack sends join/status/ack events too; only uplinks matter here.
  const event = url.searchParams.get("event");
  if (event && event !== "up") return NextResponse.json({ ignored: event });

  const body = await req.json().catch(() => null);
  const uplink = normalise(body, env.heatAlarmC());
  if (!uplink) return NextResponse.json({ ignored: "not an uplink" });

  try {
    const result = await handleUplink(uplink);
    return NextResponse.json({ ok: true, type: uplink.type, devEui: uplink.devEui, alertId: result.alert?.id ?? null });
  } catch (err) {
    console.error("ingest failed", err);
    // 500 makes TTN/ChirpStack retry, which is what we want for a missed alarm.
    return NextResponse.json({ error: "ingest failed" }, { status: 500 });
  }
}
