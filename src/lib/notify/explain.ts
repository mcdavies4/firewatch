/** Turns an Africa's Talking response (stored in alert_attempts.detail) into a plain reason. */
export function explainDelivery(detail: unknown): string {
  if (detail == null) return "No response from Africa's Talking";
  if (typeof detail === "string") return friendly(detail);
  const d = detail as {
    SMSMessageData?: { Message?: string; Recipients?: { status?: string; statusCode?: number }[] };
    errorMessage?: string;
    entries?: { status?: string; errorMessage?: string }[];
  };
  const r = d.SMSMessageData?.Recipients?.[0];
  if (r?.status) return friendly(r.status);
  if (d.SMSMessageData?.Message) return friendly(d.SMSMessageData.Message);
  if (d.entries?.[0]?.errorMessage) return friendly(d.entries[0].errorMessage);
  if (d.errorMessage) return friendly(d.errorMessage);
  return friendly(JSON.stringify(detail).slice(0, 200));
}

function friendly(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes("insufficientbalance") || s.includes("insufficient balance"))
    return `${raw} — top up your Africa's Talking account`;
  if (s.includes("invalidsenderid") || s.includes("sender"))
    return `${raw} — the sender ID isn't approved yet; clear AT_SMS_SENDER in Vercel to use the default`;
  if (s.includes("invalidphonenumber") || s.includes("unsupportednumbertype") || s.includes("couldnotroute"))
    return `${raw} — check the number; your Africa's Talking account may only send to Nigerian (+234) numbers`;
  if (s.includes("userindnd") || s.includes("dnd"))
    return `${raw} — this line has Do-Not-Disturb on; dial *785*0# (or text STOP to 2442) on it to allow messages`;
  if (s.includes("authentication") || s.includes("apikey") || s.includes("the supplied"))
    return `${raw} — check AT_USERNAME and AT_API_KEY in Vercel`;
  if (s.includes("no at_voice_number")) return "Calls are off until you buy an Africa's Talking voice number (texts still send)";
  return raw;
}
