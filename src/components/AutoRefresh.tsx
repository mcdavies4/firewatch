"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-fetches server data every few seconds so the control room sees alarms live. */
export default function AutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
