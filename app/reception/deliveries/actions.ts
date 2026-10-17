"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notifyDelivery } from "@/lib/email";

// Reception logs a parcel (RLS: reception only) and the recipient is told by email and push.
export async function logDelivery(_prev: string | null, form: FormData): Promise<string | null> {
  const text = (k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max) || null;
  const recipient = text("recipient_id", 36);
  if (!recipient) return "Pick who it's for.";
  const supabase = await createClient();
  const { data, error } = await supabase.from("deliveries")
    .insert({ recipient_id: recipient, carrier: text("carrier", 60), description: text("description", 200), tracking: text("tracking", 60) })
    .select("id").single();
  if (error || !data) return /row-level security/.test(error?.message ?? "") ? "Only reception can log deliveries." : "Could not save. Try again.";
  await notifyDelivery(data.id);
  refresh();
  return null;
}

// The recipient, or reception handing it over.
export async function collectDelivery(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("collect_delivery", { p_id: id });
  if (data !== true) throw new Error("That parcel was already collected.");
  refresh();
}
