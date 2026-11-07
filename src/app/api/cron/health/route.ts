import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { bearer, safeEqual } from "@/lib/auth/secrets";
import { runHealthCheck } from "@/lib/alerts/engine";

export const dynamic = "force-dynamic";

async function run(req: Request) {
  if (!safeEqual(bearer(req), env.cronSecret())) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, ...(await runHealthCheck()) });
}

export const GET = run;
export const POST = run;
