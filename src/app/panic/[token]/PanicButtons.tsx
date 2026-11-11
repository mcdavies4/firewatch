"use client";

import { useEffect, useState } from "react";
import { raisePanic } from "@/app/public-actions";

/** Two-tap buttons: the first tap arms (5 seconds), the second sends. Stops pocket taps. */
export default function PanicButtons({ token, showCo }: { token: string; showCo: boolean }) {
  const [armed, setArmed] = useState<"fire" | "co" | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(null), 5000);
    return () => clearTimeout(t);
  }, [armed]);

  const Btn = ({ hazard, label, color }: { hazard: "fire" | "co"; label: string; color: string }) =>
    armed === hazard ? (
      <form action={raisePanic} onSubmit={() => setSending(true)}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="hazard" value={hazard} />
        <button
          disabled={sending}
          className={`w-full animate-pulse rounded-3xl border-4 border-white ${color} p-8 text-2xl font-extrabold disabled:opacity-60`}
        >
          {sending ? "Sending…" : "TAP AGAIN TO SEND"}
        </button>
      </form>
    ) : (
      <button
        type="button"
        onClick={() => setArmed(hazard)}
        className={`w-full rounded-3xl ${color} p-8 text-2xl font-extrabold`}
      >
        {label}
      </button>
    );

  return (
    <div className="mt-10 grid w-full max-w-sm gap-5">
      <Btn hazard="fire" label="🔥 FIRE" color="bg-red-600" />
      {showCo && <Btn hazard="co" label="☠️ GAS / GENERATOR FUMES" color="bg-purple-700" />}
      <p className="text-center text-sm text-zinc-300">Tap once, then tap again within 5 seconds to send.</p>
    </div>
  );
}
