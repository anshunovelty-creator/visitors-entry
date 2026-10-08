import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// The signed-in staff member, once per request (layout and page both ask). RLS does the rest:
// reception and admins see every visit, hosts only their own.
export const getStaff = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("staff").select("id, full_name, role").eq("id", user.id).eq("active", true).maybeSingle();
  if (!me) redirect("/login");
  return { supabase, me, isReception: me.role !== "host" };
});

// Own-phone check-ins wait as "Arriving" this long for reception to confirm, then expire.
export const ARRIVING_MINUTES = 30;
export const arrivingCutoff = () => new Date(Date.now() - ARRIVING_MINUTES * 60_000).toISOString();

export const TZ = "Asia/Kolkata";
export const SOURCE = { desk: "Desk", own_phone: "Own phone", reception: "Reception" } as const;
export const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: TZ });
export const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: TZ });
export const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
