import QRCode from "qrcode";
import { db } from "@/lib/supabase";
import { env } from "@/lib/env";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

/** Printable A4 poster with the market's sign-up QR code. */
export default async function Poster({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: market } = await db().from("markets").select("name, city").eq("join_token", token).eq("kind", "market").maybeSingle();
  if (!market) return <main className="p-6">Not found.</main>;
  const url = `${env.appUrl()}/join/${token}`;
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });

  return (
    <main className="mx-auto flex min-h-screen max-w-[210mm] flex-col items-center bg-white p-10 text-center text-zinc-900 print:p-6">
      <div className="w-full rounded-2xl bg-red-600 p-6 text-white">
        <div className="text-lg font-bold tracking-widest">🔥 FIREWATCH</div>
        <h1 className="mt-2 text-4xl font-extrabold leading-tight">Protect your shop from fire</h1>
        <p className="mt-2 text-xl">{market.name}{market.city ? `, ${market.city}` : ""}</p>
      </div>
      <p className="mt-8 text-2xl font-bold">Scan with your phone camera to register</p>
      <div className="mt-4 w-80" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="mt-2 break-all font-mono text-sm text-zinc-700">{url}</p>
      <ol className="mt-8 space-y-2 text-left text-xl">
        <li>1. Scan the code</li>
        <li>2. Enter your name, phone and shop number</li>
        <li>3. Save your panic button to your home screen</li>
      </ol>
      <p className="mt-8 text-lg font-semibold text-zinc-800">
        If fire starts, you and night security are alerted at once.
      </p>
      <PrintButton />
    </main>
  );
}
