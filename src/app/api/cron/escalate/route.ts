import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { bearer, safeEqual } from "@/lib/auth/secrets";
import { escalateDue } from "@/lib/alerts/engine";

export const dynamic = "force-dynamic";

async function run(req: Request) {
  if (!safeEqual(bearer(req), env.cronSecret())) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  const escalated = await escalateDue();
  return NextResponse.json({ ok: true, escalated });
}

export const GET = run;
export const POST = run;
