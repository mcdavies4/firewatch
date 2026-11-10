import "server-only";
import { env } from "../env";

export interface SendResult {
  ok: boolean;
  ref: string | null;
  status: string;
  detail: unknown;
}

const smsBase = () =>
  env.at.sandbox() ? "https://api.sandbox.africastalking.com" : "https://api.africastalking.com";

async function post(url: string, form: Record<string, string>) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apiKey: env.at.apiKey(),
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(form).toString(),
  });
  const text = await res.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {}
  return { ok: res.ok, json };
}

/** A real voice number is set (not empty, not the +234XXXXXXXXXX placeholder from .env.example). */
export function voiceEnabled() {
  return /^\+\d{8,15}$/.test((process.env.AT_VOICE_NUMBER ?? "").trim());
}

export async function sendSms(to: string, message: string): Promise<SendResult> {
  if (env.notifyMode() === "log") {
    console.log(`[SMS → ${to}] ${message}`);
    return { ok: true, ref: null, status: "logged", detail: null };
  }
  const form: Record<string, string> = { username: env.at.username(), to, message };
  const from = env.at.smsSender();
  if (from) form.from = from;
  const { ok, json } = await post(`${smsBase()}/version1/messaging`, form);
  const recipient = (json as { SMSMessageData?: { Recipients?: { messageId?: string; status?: string }[] } })
    ?.SMSMessageData?.Recipients?.[0];
  return {
    ok: ok && recipient?.status === "Success",
    ref: recipient?.messageId ?? null,
    status: ok && recipient?.status === "Success" ? "sent" : "failed",
    detail: json,
  };
}

/**
 * Places an outbound call. When answered, Africa's Talking calls the voice callback
 * URL set on your virtual number (point it at {APP_URL}/api/voice), which reads the
 * alert aloud and asks the person to press 1 to acknowledge.
 */
export async function placeCall(to: string, clientRequestId: string): Promise<SendResult> {
  if (env.notifyMode() === "log") {
    console.log(`[CALL → ${to}] (request ${clientRequestId})`);
    return { ok: true, ref: null, status: "logged", detail: null };
  }
  // SMS-only mode: no voice number bought yet, so skip calls without breaking the SMS.
  if (!voiceEnabled()) {
    return { ok: false, ref: null, status: "skipped", detail: "No AT_VOICE_NUMBER set (SMS-only mode)" };
  }
  const { ok, json } = await post("https://voice.africastalking.com/call", {
    username: env.at.username(),
    from: env.at.voiceNumber(),
    to,
    clientRequestId,
  });
  const entry = (json as { entries?: { sessionId?: string; status?: string }[] })?.entries?.[0];
  const queued = ok && entry?.status === "Queued";
  return { ok: queued, ref: entry?.sessionId ?? null, status: queued ? "sent" : "failed", detail: json };
}
