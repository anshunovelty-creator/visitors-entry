"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOutVisit(visitId: string, guestId?: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_sign_out", { p_visit_id: visitId, p_guest_id: guestId ?? null });
  if (error) throw new Error("Could not sign out. Refresh and try again.");
  // Lobby or a visit's detail page, whichever the button was on.
  refresh();
}

export async function signOutStaff() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
