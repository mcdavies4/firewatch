"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/supabase";
import { acknowledge } from "@/lib/alerts/engine";

const s = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

/** Public: used by the link in the SMS. Token is unguessable, so no login needed. */
export async function ackFromLink(f: FormData) {
  const token = s(f, "token")!;
  const name = s(f, "name") ?? "Someone (via SMS link)";
  const { data } = await db().from("alerts").select("id").eq("ack_token", token).maybeSingle();
  if (data) await acknowledge(data.id, name);
  redirect(`/ack/${token}?done=1`);
}

