export const STATUS_STYLE: Record<string, { label: string; tile: string; dot: string }> = {
  alarm: { label: "FIRE ALARM", tile: "bg-red-600 text-white animate-pulse", dot: "bg-red-600" },
  tamper: { label: "Tamper", tile: "bg-orange-500 text-white", dot: "bg-orange-500" },
  offline: { label: "Offline", tile: "bg-zinc-400 text-white", dot: "bg-zinc-400" },
  low_battery: { label: "Low battery", tile: "bg-amber-300 text-zinc-900", dot: "bg-amber-400" },
  ok: { label: "OK", tile: "bg-emerald-600 text-white", dot: "bg-emerald-600" },
  unassigned: { label: "Unassigned", tile: "bg-zinc-200 text-zinc-700", dot: "bg-zinc-300" },
  none: { label: "No sensor", tile: "border-2 border-dashed border-zinc-300 text-zinc-500", dot: "bg-zinc-200" },
};

const RANK = ["alarm", "tamper", "offline", "low_battery", "ok", "unassigned", "none"];

export function worstStatus(statuses: string[]): string {
  if (!statuses.length) return "none";
  return statuses.sort((a, b) => RANK.indexOf(a) - RANK.indexOf(b))[0];
}

export function ago(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export const AUDIT_ITEMS: { key: string; label: string }[] = [
  { key: "wiring_safe", label: "No exposed, overloaded or improvised wiring" },
  { key: "sockets_ok", label: "Sockets/extensions not daisy-chained or overloaded" },
  { key: "power_off_at_close", label: "Power isolated at close of business" },
  { key: "no_fuel_storage", label: "No petrol/diesel/gas stored in shop" },
  { key: "generator_outside", label: "Generator (if any) outside and away from stock" },
  { key: "no_cooking", label: "No cooking or open flames in shop" },
  { key: "extinguisher_present", label: "Serviced extinguisher in shop or within 15m" },
  { key: "access_clear", label: "Walkway/exit in front of shop kept clear" },
  { key: "stock_clearance", label: "Stock kept clear of lights and electrics" },
  { key: "sensor_fitted", label: "Firewatch sensor fitted and tested" },
  { key: "owner_trained", label: "Owner/attendant trained on extinguisher use" },
  { key: "contacts_verified", label: "Owner phone numbers verified" },
];

export const PASS_MARK = 80;
