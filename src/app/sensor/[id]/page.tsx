import { db } from "@/lib/supabase";
import { safeEqual } from "@/lib/auth/secrets";
import VirtualSensor from "./VirtualSensor";

export const dynamic = "force-dynamic";

/**
 * Virtual sensor for demos: open on a second phone and tap Smoke / CO.
 * It posts to /api/device exactly like the ESP32 unit, so the whole alert
 * pipeline runs for real. Link (with the device key) is on the home page.
 */
export default async function SensorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ k?: string }>;
}) {
  const { id } = await params;
  const { k } = await searchParams;
  const { data: sensor } = await db()
    .from("sensors")
    .select("dev_eui, device_key, label, shops(shop_number, markets(name, kind))")
    .eq("dev_eui", id.toUpperCase())
    .maybeSingle();

  if (!sensor?.device_key || !safeEqual(k, sensor.device_key)) {
    return <main className="p-6 text-center text-zinc-700">This sensor link is not valid.</main>;
  }

  const shop = (sensor as unknown as {
    shops: { shop_number: string; markets: { name: string; kind: string } | null } | null;
  }).shops;
  const isHome = shop?.markets?.kind === "home";
  const label = isHome ? (sensor.label ?? "Alarm") : `Shop ${shop?.shop_number ?? "?"}`;

  return <VirtualSensor deviceId={sensor.dev_eui} deviceKey={k!} label={label} home={shop?.markets?.name ?? "Firewatch"} />;
}
