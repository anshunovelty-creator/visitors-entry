"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Any active staff member can run or join a roll call; the database functions check that.
export async function startRollCall() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_roll_call");
  if (error) throw new Error("Could not start the roll call.");
  redirect("/reception/roll-call");
}

export async function markSafe(rollCallId: string, personId: string, safe: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_safe", { p_id: rollCallId, p_person: personId, p_safe: safe });
  if (error) throw new Error(/ended/.test(error.message) ? "This roll call has ended." : "Could not save. Try again.");
  refresh();
}

export async function endRollCall(rollCallId: string) {
  const supabase = await createClient();
  await supabase.rpc("end_roll_call", { p_id: rollCallId });
  refresh();
}
