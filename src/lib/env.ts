import "server-only";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

export const env = {
  supabaseUrl: () => required("SUPABASE_URL"),
  supabaseServiceKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  appUrl: () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  webhookSecret: () => required("INGEST_WEBHOOK_SECRET"),
  cronSecret: () => required("CRON_SECRET"),
  /** "log" = print alerts to console only (safe default). "live" = real calls/SMS. */
  notifyMode: () => (process.env.NOTIFY_MODE === "live" ? "live" : "log") as "live" | "log",
  escalationSeconds: () => Number(process.env.ESCALATION_SECONDS ?? 60),
  offlineMinutes: () => Number(process.env.OFFLINE_MINUTES ?? 180),
  lowBatteryPct: () => Number(process.env.LOW_BATTERY_PCT ?? 20),
  heatAlarmC: () => Number(process.env.HEAT_ALARM_C ?? 57),
  at: {
    username: () => required("AT_USERNAME"),
    apiKey: () => required("AT_API_KEY"),
    voiceNumber: () => required("AT_VOICE_NUMBER"), // your Africa's Talking virtual number
    smsSender: () => process.env.AT_SMS_SENDER || undefined, // approved sender ID, optional
    sandbox: () => process.env.AT_ENV === "sandbox",
  },
};
