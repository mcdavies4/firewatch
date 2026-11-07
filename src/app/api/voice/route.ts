import { env } from "@/lib/env";
import { db } from "@/lib/supabase";
import { acknowledge, getAlertContext, voiceScript } from "@/lib/alerts/engine";

export const dynamic = "force-dynamic";

/**
 * Africa's Talking voice callback. Set this URL ({APP_URL}/api/voice) as the
 * callback on your AT virtual number. AT posts form data when the call is
 * answered, when digits are pressed, and when the call ends.
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const get = (k: string) => (form.get(k) as string | null) ?? null;

  const sessionId = get("sessionId");
  const isActive = get("isActive") === "1";
  const digits = get("dtmfDigits");
  const clientRequestId = get("clientRequestId");

  const supa = db();
  let attempt: { id: string; alert_id: string; contact_name: string } | null = null;
  if (sessionId) {
    const { data } = await supa
      .from("alert_attempts")
      .select("id, alert_id, contact_name")
      .eq("provider_ref", sessionId)
      .maybeSingle();
    attempt = data;
  }
  if (!attempt && clientRequestId) {
    const { data } = await supa
      .from("alert_attempts")
      .select("id, alert_id, contact_name")
      .eq("id", clientRequestId)
      .maybeSingle();
    attempt = data;
  }

  if (!isActive) {
    if (attempt) {
      await supa
        .from("alert_attempts")
        .update({ detail: Object.fromEntries(form.entries()) })
        .eq("id", attempt.id);
    }
    return xml("<Response/>");
  }

  if (!attempt) {
    return xml(`<Response><Say>This is Firewatch. No active alert was found for this call. Goodbye.</Say></Response>`);
  }

  const ctx = await getAlertContext(attempt.alert_id);
  if (!ctx) return xml(`<Response><Say>Alert not found. Goodbye.</Say></Response>`);

  if (digits === "1") {
    const first = await acknowledge(attempt.alert_id, attempt.contact_name);
    await supa.from("alert_attempts").update({ status: "acknowledged" }).eq("id", attempt.id);
    return xml(
      `<Response><Say>${esc(
        first
          ? "Thank you. Everyone has been told you are responding. Go now and stay safe."
          : "Thank you. Someone is already responding, but please go and assist if it is safe.",
      )}</Say></Response>`,
    );
  }

  await supa.from("alert_attempts").update({ status: "answered" }).eq("id", attempt.id);
  const callback = `${env.appUrl()}/api/voice`;
  const script = esc(voiceScript(ctx));
  return xml(
    `<Response>` +
      `<GetDigits timeout="15" numDigits="1" finishOnKey="#" callbackUrl="${callback}">` +
      `<Say>${script}</Say>` +
      `</GetDigits>` +
      `<Say>${script}</Say>` +
      `</Response>`,
  );
}

function xml(body: string) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>${body}`, {
    headers: { "Content-Type": "application/xml" },
  });
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
