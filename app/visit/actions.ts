"use server";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { arrivingCutoff } from "../reception/staff";

// Public: anyone with the poster link can call these. The browser gets no table access; the
// service-role client here does narrow, checked things only, and check-in goes through create_visit.

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const PER_IP = 5; // check-ins per IP per 10 minutes
const OVERALL = 60; // own-phone check-ins per 10 minutes, all IPs together

async function originHash() {
  const h = await headers();
  return sha((h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown");
}

// ponytail: counts on visits only; host search and invite lookups are capped but not rate limited.
// Add Vercel KV / Upstash rate limiting if the poster URL ever gets abused.
async function tooBusy(admin: ReturnType<typeof createAdminClient>, origin: string) {
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const [{ count: mine }, { count: all }] = await Promise.all([
    admin.from("visits").select("id", { count: "exact", head: true }).eq("origin_hash", origin).gte("arrived_at", since),
    admin.from("visits").select("id", { count: "exact", head: true }).eq("source", "own_phone").gte("arrived_at", since),
  ]);
  return (mine ?? 0) >= PER_IP || (all ?? 0) >= OVERALL;
}

// Name and department only, like the desk device. Two letters minimum so it can't list everyone.
export async function searchHosts(q: string) {
  // Letters, digits, spaces, . ' - only: PostgREST's or() treats , ( ) " * as syntax.
  const term = String(q ?? "").replace(/[^\p{L}\p{M}\p{N} .'-]/gu, "").trim().slice(0, 40);
  if (term.length < 2) return [];
  const { data } = await createAdminClient()
    .from("staff")
    .select("id, full_name, department")
    .eq("active", true)
    .or(`full_name.ilike."${term}*",full_name.ilike."* ${term}*"`)
    .order("full_name")
    .limit(8);
  return data ?? [];
}

export async function redeemInvite(code: string) {
  const { data } = await createAdminClient().rpc("redeem_invite", { p_code: String(code ?? "").slice(0, 10) }).maybeSingle();
  return data ?? null;
}

// The photo goes from the phone straight to storage on a one-path signed URL; it never passes through Vercel.
export async function startPhotoUpload(): Promise<{ path: string; token: string } | { error: string }> {
  const admin = createAdminClient();
  if (await tooBusy(admin, await originHash())) return { error: "Too many check-ins from here. Please ask at reception." };
  const path = `phone/${randomUUID()}.jpg`;
  const { data, error } = await admin.storage.from("visit-photos").createSignedUploadUrl(path);
  return error || !data ? { error: "We couldn't start the photo upload. Please try again." } : { path, token: data.token };
}

type PhoneCheckIn = {
  name: string; company: string; mobile: string; purpose: string;
  hostId: string | null; guests: string[]; photoPath: string; inviteId: string | null;
};

// Returns the secret the phone keeps to follow (and later sign out of) its own visit.
export async function phoneCheckIn(i: PhoneCheckIn): Promise<{ token: string } | { error: string }> {
  const admin = createAdminClient();
  const origin = await originHash();
  if (await tooBusy(admin, origin)) return { error: "Too many check-ins from here. Please ask at reception." };
  const token = randomBytes(24).toString("base64url");
  const { error } = await admin.rpc("create_visit", {
    p_source: "own_phone", p_device: null,
    p_visitor_name: String(i.name ?? ""), p_company: String(i.company ?? ""), p_mobile: String(i.mobile ?? ""),
    p_purpose: String(i.purpose ?? ""), p_host_id: i.inviteId ? null : i.hostId,
    p_guests: Array.isArray(i.guests) ? i.guests.map(String) : [],
    p_photo_path: String(i.photoPath ?? ""), p_invite_id: i.inviteId,
    p_phone_token_hash: sha(token), p_origin_hash: origin,
  });
  if (error) {
    return { error: /invite/.test(error.message) ? "That invite has already been used. Please ask at reception." : "Something went wrong checking you in. Please ask at reception." };
  }
  return { token };
}

export type PhoneVisit = {
  status: "arriving" | "checked_in" | "checked_out" | "declined" | "expired";
  code: string | null; first: string; host: string; checkedInAt: string | null; guests: number;
};

export async function visitStatus(token: string): Promise<PhoneVisit | null> {
  if (!token || token.length > 64) return null;
  const { data: v } = await createAdminClient()
    .from("visits")
    .select("status, code, visitor_name, arrived_at, checked_in_at, host:staff!visits_host_id_fkey(full_name), visit_guests(checked_out_at)")
    .eq("phone_token_hash", sha(token))
    .maybeSingle();
  if (!v) return null;
  const stale = v.status === "arriving" && Date.parse(v.arrived_at) < Date.parse(arrivingCutoff());
  return {
    status: stale ? "expired" : v.status,
    code: v.code,
    first: v.visitor_name.split(/\s+/)[0],
    host: (v.host as unknown as { full_name: string } | null)?.full_name ?? "Reception",
    checkedInAt: v.checked_in_at,
    guests: (v.visit_guests as { checked_out_at: string | null }[]).filter((g) => !g.checked_out_at).length,
  };
}

export async function phoneSignOut(token: string) {
  if (!token || token.length > 64) return false;
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data } = await admin.from("visits").update({ status: "checked_out", checked_out_at: now })
    .eq("phone_token_hash", sha(token)).eq("status", "checked_in").select("id").maybeSingle();
  if (!data) return false;
  await admin.from("visit_guests").update({ checked_out_at: now }).eq("visit_id", data.id).is("checked_out_at", null);
  return true;
}
