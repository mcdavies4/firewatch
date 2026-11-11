import "server-only";
import { env } from "../env";
import { sendSmsAfricasTalking, type SendResult } from "./africastalking";

/**
 * SMS with automatic fallback across providers.
 *
 * SMS_PROVIDERS sets the order, e.g. "africastalking,bulksmsnigeria,termii".
 * Each is tried in turn until one accepts the message. Providers without their
 * keys set are skipped. Default: africastalking only.
 *
 * Why: Nigerian lines on Do-Not-Disturb only receive texts sent on a transactional /
 * corporate route with an approved sender ID. Apply with several providers at once;
 * whichever approves first starts delivering, no code change needed.
 */

type Provider = {
  name: string;
  ready: () => boolean;
  send: (to: string, message: string) => Promise<SendResult>;
};

const digits = (to: string) => to.replace(/\D/g, ""); // +2348031234567 -> 2348031234567

async function postJson(url: string, body: object, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: res.ok, status: res.status, json };
}

const PROVIDERS: Record<string, Provider> = {
  africastalking: {
    name: "africastalking",
    ready: () => !!process.env.AT_USERNAME && !!process.env.AT_API_KEY,
    send: sendSmsAfricasTalking,
  },

  // https://www.bulksmsnigeria.com/api — corporate route reaches DND once the sender ID is approved.
  bulksmsnigeria: {
    name: "bulksmsnigeria",
    ready: () => !!process.env.BULKSMSNG_TOKEN && !!process.env.BULKSMSNG_FROM,
    send: async (to, message) => {
      const { ok, json } = await postJson(
        "https://www.bulksmsnigeria.com/api/v2/sms",
        {
          from: process.env.BULKSMSNG_FROM,
          to: digits(to),
          body: message,
          gateway: process.env.BULKSMSNG_GATEWAY || "direct-corporate",
        },
        { Authorization: `Bearer ${process.env.BULKSMSNG_TOKEN}` },
      );
      const sent = ok && json?.status === "success";
      const data = (json?.data ?? {}) as { message_id?: string };
      return { ok: sent, ref: data.message_id ?? null, status: sent ? "sent" : "failed", detail: json };
    },
  },

  // https://developers.termii.com — "dnd" channel reaches DND once Termii activates it on the account.
  termii: {
    name: "termii",
    ready: () => !!process.env.TERMII_API_KEY && !!process.env.TERMII_FROM,
    send: async (to, message) => {
      const { ok, json } = await postJson(`${process.env.TERMII_BASE_URL || "https://api.ng.termii.com"}/api/sms/send`, {
        api_key: process.env.TERMII_API_KEY,
        to: digits(to),
        from: process.env.TERMII_FROM,
        sms: message,
        type: "plain",
        channel: process.env.TERMII_CHANNEL || "dnd",
      });
      const id = json?.message_id;
      const sent = ok && !!id;
      return { ok: sent, ref: id ? String(id) : null, status: sent ? "sent" : "failed", detail: json };
    },
  },
};

export function smsProviderOrder(): string[] {
  const list = (process.env.SMS_PROVIDERS || "africastalking")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x in PROVIDERS);
  return list.length ? list : ["africastalking"];
}

/** Which providers are configured, in order, for the Demo page. */
export function smsProviderStatus() {
  return smsProviderOrder().map((n) => ({ name: n, ready: PROVIDERS[n].ready() }));
}

/** Sends an SMS, falling back to the next provider on failure. Never throws. */
export async function sendSms(to: string, message: string): Promise<SendResult> {
  if (env.notifyMode() === "log") {
    console.log(`[SMS → ${to}] ${message}`);
    return { ok: true, ref: null, status: "logged", detail: null };
  }
  const tried: { provider: string; status: string; detail: unknown }[] = [];
  for (const name of smsProviderOrder()) {
    const p = PROVIDERS[name];
    if (!p.ready()) continue;
    const res = await p.send(to, message).catch(
      (err): SendResult => ({ ok: false, ref: null, status: "failed", detail: { errorMessage: String(err) } }),
    );
    tried.push({ provider: name, status: res.status, detail: res.detail });
    if (res.status === "sent") {
      return { ...res, detail: tried.length > 1 ? { provider: name, attempts: tried } : { provider: name, ...asObj(res.detail) } };
    }
  }
  if (!tried.length) {
    return { ok: false, ref: null, status: "failed", detail: { errorMessage: "No SMS provider configured" } };
  }
  return { ok: false, ref: null, status: "failed", detail: tried.length > 1 ? { attempts: tried } : tried[0].detail };
}

const asObj = (d: unknown) => (d && typeof d === "object" && !Array.isArray(d) ? (d as object) : { raw: d });
