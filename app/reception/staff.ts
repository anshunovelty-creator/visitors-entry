import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient, signedInUser } from "@/lib/supabase/server";

// The signed-in staff member, once per request (layout and page both ask). RLS does the rest:
// reception and admins see every visit, hosts only their own.
export const getStaff = cache(async () => {
  const supabase = await createClient();
  const user = await signedInUser(supabase);
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("staff").select("id, full_name, role, must_change_password").eq("id", user.id).eq("active", true).maybeSingle();
  if (!me) redirect("/login");
  if (me.must_change_password) redirect("/account"); // the admin-given password gets replaced first
  return { supabase, me, isReception: me.role !== "host" };
});

// Own-phone check-ins wait as "Arriving" this long for reception to confirm, then expire.
export const ARRIVING_MINUTES = 30;
export const arrivingCutoff = () => new Date(Date.now() - ARRIVING_MINUTES * 60_000).toISOString();
// A host who hasn't answered this long is reminded once, and reception sees "No answer".
export const REMIND_MINUTES = 5;
// Visitors inside this long are flagged in the lobby; anyone left at office midnight is signed out.
export const OVERSTAY_HOURS = 4;
export const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
export const minutesSince = (iso: string) => Math.floor((Date.now() - Date.parse(iso)) / 60_000);
export const duration = (mins: number) => (mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`);

export const TZ = "Asia/Kolkata";
// Same as office_today() / office_day_start() in SQL, worked out here to save a round trip.
// India has no daylight saving, so office midnight is always +05:30.
export const officeToday = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD
export const officeDayStart = () => new Date(`${officeToday()}T00:00:00+05:30`).toISOString();
export const SOURCE = { desk: "Desk", own_phone: "Own phone", reception: "Reception" } as const;
export const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: TZ });
export const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: TZ });
// Served by app/reception/photo/route.ts at a stable, browser-cacheable URL.
export const photoSrc = (path: string) => `/reception/photo?p=${encodeURIComponent(path)}`;
export const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
