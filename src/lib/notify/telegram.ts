import "server-only";
import { createHmac } from "crypto";
import type { SendResult } from "./africastalking";

/**
 * Telegram alerts. Setup: create a bot with @BotFather, then set in Vercel:
 *   TELEGRAM_BOT_TOKEN=123456:ABC...   TELEGRAM_BOT_USERNAME=FirewatchAlertsBot
 * Then press "Connect Telegram bot" on the Demo page (registers the webhook).
 */
const token = () => process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
export const telegramEnabled = () => !!token() && !!process.env.TELEGRAM_BOT_USERNAME?.trim();
export const botUsername = () => (process.env.TELEGRAM_BOT_USERNAME ?? "").trim().replace(/^@/, "");

/** Secret used for the webhook header and for signing link codes. */
export function telegramSecret() {
  const base = process.env.TELEGRAM_WEBHOOK_SECRET || process.env.INGEST_WEBHOOK_SECRET || token();
  return createHmac("sha256", base).update("firewatch-telegram").digest("hex").slice(0, 48);
}

/** Start code for t.me/<bot>?start=<code>: the phone digits plus a signature (max 64 chars, [A-Za-z0-9_-]). */
export function linkCode(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const sig = createHmac("sha256", telegramSecret()).update(digits).digest("hex").slice(0, 12);
  return `p${digits}_${sig}`;
}

/** Returns the phone (E.164) for a valid start code, else null. */
export function phoneFromCode(code: string): string | null {
  const m = /^p(\d{8,15})_([0-9a-f]{12})$/.exec(code.trim());
  if (!m) return null;
  return linkCode("+" + m[1]) === code.trim() ? "+" + m[1] : null;
}

export const linkUrl = (phone: string) => `https://t.me/${botUsername()}?start=${linkCode(phone)}`;

export async function tg(method: string, payload: object): Promise<{ ok: boolean; json: unknown }> {
  const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  const json = await res.json().catch(() => null);
  return { ok: res.ok && (json as { ok?: boolean } | null)?.ok === true, json };
}

/** Sends an alert message, optionally with a big link button. Never throws. */
export async function sendTelegram(
  chatId: number | string,
  text: string,
  button?: { text: string; url: string },
): Promise<SendResult> {
  try {
    const { ok, json } = await tg("sendMessage", {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...(button ? { reply_markup: { inline_keyboard: [[{ text: button.text, url: button.url }]] } } : {}),
    });
    const msgId = (json as { result?: { message_id?: number } } | null)?.result?.message_id;
    return {
      ok,
      ref: msgId ? String(msgId) : null,
      status: ok ? "sent" : "failed",
      detail: ok ? { chat_id: chatId } : { chat_id: chatId, errorMessage: (json as { description?: string })?.description ?? "Telegram error" },
    };
  } catch (err) {
    return { ok: false, ref: null, status: "failed", detail: { chat_id: chatId, errorMessage: String(err) } };
  }
}
