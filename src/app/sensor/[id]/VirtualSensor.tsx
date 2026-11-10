"use client";

import { useEffect, useRef, useState } from "react";

type Mode = "idle" | "fire" | "co";

export default function VirtualSensor({
  deviceId,
  deviceKey,
  label,
  home,
}: {
  deviceId: string;
  deviceKey: string;
  label: string;
  home: string;
}) {
  const [mode, setMode] = useState<Mode>("idle");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const audio = useRef<AudioContext | null>(null);
  const beepTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const note = (line: string) =>
    setLog((l) => [`${new Date().toLocaleTimeString("en-GB")}  ${line}`, ...l].slice(0, 6));

  // Alarm sound: fast beeps for fire, 4-beep pattern for CO (like real alarms).
  useEffect(() => {
    if (beepTimer.current) clearInterval(beepTimer.current);
    if (mode === "idle") return;
    let tick = 0;
    beepTimer.current = setInterval(() => {
      tick++;
      const on = mode === "fire" ? tick % 2 === 0 : tick % 20 < 8 && tick % 2 === 0;
      if (!on || !audio.current) return;
      const ctx = audio.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 3100;
      gain.gain.value = 0.2;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.18);
    }, 250);
    return () => {
      if (beepTimer.current) clearInterval(beepTimer.current);
    };
  }, [mode]);

  async function send(event: "fire" | "co" | "heartbeat" | "test") {
    // Browsers only allow sound after a tap, so create the audio context here.
    audio.current ??= new AudioContext();
    setBusy(true);
    try {
      const res = await fetch("/api/device", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Device-Key": deviceKey },
        body: JSON.stringify({
          device_id: deviceId,
          event,
          virtual: true,
          smoke_raw: event === "fire" ? 2700 : 650,
          co_raw: event === "co" ? 2500 : 480,
          co_ppm: event === "co" ? 320 : 2,
          battery: 96,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        note(`Failed (${res.status}) — ${json.error ?? "try again"}`);
        return;
      }
      if (event === "fire" || event === "co") {
        setMode(event);
        note(
          json.alertId
            ? `${event === "co" ? "CO" : "Fire"} alarm sent — alerting contacts now`
            : "Alarm sent, but an alert is already open. Close it on the dashboard to run a fresh drill.",
        );
      } else if (event === "heartbeat") {
        setMode("idle");
        note("All clear sent (a person still closes the alert)");
      } else {
        note("Test signal sent — device is connected");
      }
    } catch {
      note("No connection — check the internet and try again");
    } finally {
      setBusy(false);
    }
  }

  const alarming = mode !== "idle";
  const ring =
    mode === "fire" ? "bg-red-600 animate-pulse" : mode === "co" ? "bg-purple-600 animate-pulse" : "bg-emerald-500";

  return (
    <main className="flex min-h-screen flex-col items-center bg-zinc-950 px-5 py-8 text-white">
      <div className="text-sm uppercase tracking-widest text-zinc-300">Firewatch · virtual sensor</div>
      <h1 className="mt-1 text-center text-xl font-bold">{home}</h1>
      <div className="text-sm text-zinc-300">{label}</div>

      {/* The "device" */}
      <div className="mt-8 flex h-56 w-56 items-center justify-center rounded-full bg-zinc-100 shadow-[0_0_60px_rgba(255,255,255,0.08)]">
        <div className="flex h-40 w-40 flex-col items-center justify-center rounded-full border-8 border-zinc-200 bg-white">
          <div className={`h-5 w-5 rounded-full ${ring}`} />
          <div className="mt-3 text-xs font-bold tracking-widest text-zinc-600">FIREWATCH</div>
          <div className={`mt-1 text-sm font-bold ${alarming ? "text-red-600" : "text-emerald-600"}`}>
            {mode === "fire" ? "SMOKE" : mode === "co" ? "CO DANGER" : "OK"}
          </div>
        </div>
      </div>

      <div className="mt-10 grid w-full max-w-sm gap-3">
        <button
          disabled={busy}
          onClick={() => send("fire")}
          className="rounded-2xl bg-red-600 p-5 text-xl font-bold disabled:opacity-50"
        >
          🔥 Smoke detected
        </button>
        <button
          disabled={busy}
          onClick={() => send("co")}
          className="rounded-2xl bg-purple-700 p-5 text-xl font-bold disabled:opacity-50"
        >
          ☠️ Carbon monoxide
        </button>
        <div className="grid grid-cols-2 gap-3">
          <button
            disabled={busy}
            onClick={() => send("heartbeat")}
            className="rounded-2xl bg-zinc-800 p-4 font-semibold disabled:opacity-50"
          >
            ✅ All clear
          </button>
          <button
            disabled={busy}
            onClick={() => send("test")}
            className="rounded-2xl bg-zinc-800 p-4 font-semibold disabled:opacity-50"
          >
            📡 Test link
          </button>
        </div>
      </div>

      <ul className="mt-6 w-full max-w-sm space-y-1 font-mono text-sm text-zinc-200">
        {log.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </main>
  );
}
