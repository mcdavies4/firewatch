import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { safeEqual } from "@/lib/auth/secrets";
import { phoneFromCode, sendTelegram, telegramSecret } from "@/lib/notify/telegram";

export const dynamic = "force-dynamic";

/**
 * Telegram bot webhook (registered from the Demo page).
 * /start <code> links this chat to a phone number, so that number's alerts come here too.
 * /stop unlinks.
 */
export async function POST(req: Request) {
  if (!safeEqual(req.headers.get("x-telegram-bot-api-secret-token"), telegramSecret())) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  const update = (await req.json().catch(() => null)) as {
    message?: { chat?: { id?: number }; from?: { first_name?: string; last_name?: string; username?: string }; text?: string };
  } | null;
  const msg = update?.message;
  const chatId = msg?.chat?.id;
  const text = (msg?.text ?? "").trim();
  if (!chatId || !text) return NextResponse.json({ ok: true });

  const name = [msg?.from?.first_name, msg?.from?.last_name].filter(Boolean).join(" ") || msg?.from?.username || null;

  if (text.startsWith("/start")) {
    const code = text.split(/\s+/)[1] ?? "";
    const phone = code ? phoneFromCode(code) : null;
    if (!phone) {
      await sendTelegram(
        chatId,
        "👋 This is Firewatch. To get alerts here, open the 'Connect Telegram' link you were sent from the Firewatch dashboard.",
      );
      return NextResponse.json({ ok: true });
    }
    await db()
      .from("telegram_links")
      .upsert({ phone, chat_id: chatId, telegram_name: name, linked_at: new Date().toISOString() }, { onConflict: "phone" });
    await sendTelegram(
      chatId,
      `✅ Connected. Firewatch fire and carbon monoxide alerts for ${phone} will now come here as well as by SMS.\n\nSend /stop to disconnect.`,
    );
    return NextResponse.json({ ok: true });
  }

  if (text.startsWith("/stop")) {
    await db().from("telegram_links").delete().eq("chat_id", chatId);
    await sendTelegram(chatId, "Disconnected. You won't get Firewatch alerts here any more.");
    return NextResponse.json({ ok: true });
  }

  await sendTelegram(chatId, "Firewatch alerts arrive here automatically. Send /stop to disconnect.");
  return NextResponse.json({ ok: true });
}
