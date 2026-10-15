"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { notifyHost } from "@/lib/email";
import { arrivingCutoff } from "./staff";

export async function signOutVisit(visitId: string, guestId?: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_sign_out", { p_visit_id: visitId, p_guest_id: guestId ?? null });
  if (error) throw new Error("Could not sign out. Refresh and try again.");
  // Lobby or a visit's detail page, whichever the button was on.
  refresh();
}

// Own-phone arrivals: reception matches the 3-digit code on the visitor's phone, then confirms.
// RLS limits these updates to reception and admins; a host's update simply matches nothing.
export async function confirmArrival(visitId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data } = await supabase.from("visits")
    .update({ status: "checked_in", checked_in_at: new Date().toISOString(), checked_in_by: user?.id })
    .eq("id", visitId).eq("status", "arriving")
    .gte("arrived_at", arrivingCutoff())
    .select("id").maybeSingle();
  if (!data) throw new Error("That arrival has expired or was already handled.");
  await notifyHost(visitId);
  refresh();
}

export async function declineArrival(visitId: string) {
  const supabase = await createClient();
  await supabase.from("visits").update({ status: "declined" }).eq("id", visitId).eq("status", "arriving");
  refresh();
}

// One click from "Expected today": checks the invited visitor (and their listed guests) in.
export async function checkInExpected(inviteId: string) {
  const supabase = await createClient();
  const { data: visitId, error } = await supabase.rpc("staff_check_in_invite", { p_invite_id: inviteId });
  if (error) throw new Error("That invite has already been used or isn't for today.");
  await notifyHost(visitId as string);
  refresh();
}

// Walk-in without an invite. The photo (optional) was already uploaded from the browser under staff/.
export async function checkInWalkIn(form: FormData): Promise<string> {
  const text = (k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max) || null;
  const name = text("visitor_name", 120);
  if (!name) return "Enter the visitor's name.";
  const guests = String(form.get("guests") ?? "").split("\n").map((g) => g.trim().slice(0, 120)).filter(Boolean).slice(0, 20);
  const supabase = await createClient();
  const { data: visitId, error } = await supabase.rpc("staff_check_in", {
    p_visitor_name: name, p_company: text("company", 120), p_mobile: text("mobile", 30), p_purpose: text("purpose", 60),
    p_host_id: text("host_id", 36), p_guests: guests, p_photo_path: text("photo_path", 60),
  });
  if (error) return /reception only/.test(error.message) ? "Only reception can check visitors in." : "Could not check them in. Try again.";
  await notifyHost(visitId as string);
  redirect("/reception");
}

export async function resendHostEmail(visitId: string) {
  const supabase = await createClient();
  const { data: reception } = await supabase.rpc("is_reception");
  // Reading through RLS too, so the service role only ever emails about a visit the caller can see.
  const { data } = await supabase.from("visits").select("id").eq("id", visitId).maybeSingle();
  if (reception === true && data) await notifyHost(visitId);
  refresh();
}

// The host's own answer from the app. host_respond only accepts it for the caller's own open visit.
export async function hostRespond(visitId: string, response: "coming" | "unavailable") {
  const supabase = await createClient();
  const { data } = await supabase.rpc("host_respond", { p_visit_id: visitId, p_response: response });
  if (data !== true) throw new Error("You can only answer for your own visitor while they're here.");
  refresh();
}

export async function signOutStaff() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
