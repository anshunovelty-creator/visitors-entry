"use server";

import { createHash, randomInt, randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";

const ROLES = ["host", "reception", "admin"] as const;
type Role = (typeof ROLES)[number];
const MIN_PASSWORD = 8;

// Every action re-checks the caller. Table writes go through the caller's own session, so RLS
// (admins only) applies too; the service-role client is only for auth.users.
async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Signed out.");
  const { data: me } = await supabase.from("staff").select("role, active").eq("id", user.id).maybeSingle();
  if (me?.role !== "admin" || !me.active) throw new Error("Admins only.");
  return { supabase, myId: user.id };
}

// ---------------------------------------------------------------- staff

export async function addStaff(_prev: string | null, form: FormData): Promise<string | null> {
  const { supabase } = await requireAdmin();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const fullName = String(form.get("full_name") ?? "").trim();
  const department = String(form.get("department") ?? "").trim() || null;
  const role = String(form.get("role")) as Role;
  const password = String(form.get("password") ?? "");
  if (!email.includes("@") || !fullName) return "Name and email are required.";
  if (!ROLES.includes(role)) return "Pick a role.";
  if (password.length < MIN_PASSWORD) return `Password needs at least ${MIN_PASSWORD} characters.`;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) return error.code === "email_exists" ? "Someone already has that email." : error.message;
  const { error: e2 } = await supabase.from("staff").insert({ id: data.user.id, email, full_name: fullName, role, department });
  if (e2) {
    await admin.auth.admin.deleteUser(data.user.id);
    return "Could not save the staff record.";
  }
  refresh();
  return null;
}

export async function updateStaff(id: string, form: FormData) {
  const { supabase, myId } = await requireAdmin();
  const role = String(form.get("role")) as Role;
  if (!ROLES.includes(role)) throw new Error("Pick a role.");
  if (id === myId && role !== "admin") throw new Error("You can't remove your own admin access.");
  const { error } = await supabase.from("staff")
    .update({ role, department: String(form.get("department") ?? "").trim() || null })
    .eq("id", id);
  if (error) throw new Error("Could not save.");
  refresh();
}

// Deactivated staff can't sign in and vanish from the kiosk host list; their visit history stays.
export async function setStaffActive(id: string, active: boolean) {
  const { supabase, myId } = await requireAdmin();
  if (id === myId) throw new Error("You can't deactivate yourself.");
  const { error } = await supabase.from("staff").update({ active }).eq("id", id);
  if (error) throw new Error("Could not save.");
  await createAdminClient().auth.admin.updateUserById(id, { ban_duration: active ? "none" : "876000h" });
  refresh();
}

export async function resetPassword(id: string, _prev: string | null, form: FormData): Promise<string | null> {
  await requireAdmin();
  const password = String(form.get("password") ?? "");
  if (password.length < MIN_PASSWORD) return `At least ${MIN_PASSWORD} characters.`;
  const { error } = await createAdminClient().auth.admin.updateUserById(id, { password });
  return error ? error.message : "saved";
}

// ---------------------------------------------------------------- desk devices

// No 0/O/1/I/L, so the code reads cleanly off a screen.
function newCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const code = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join("");
  return {
    code: `${code.slice(0, 4)}-${code.slice(4)}`,
    enrollment_code_hash: createHash("sha256").update(code).digest("hex"),
    enrollment_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  };
}

type CodeResult = { code?: string; error?: string } | null;

export async function addDevice(_prev: CodeResult, form: FormData): Promise<CodeResult> {
  const { supabase } = await requireAdmin();
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Give the device a name, like “Front desk”." };
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({ email: `kiosk-${randomUUID()}@devices.invalid`, email_confirm: true });
  if (error) return { error: error.message };
  const { code, ...enrollment } = newCode();
  const { error: e2 } = await supabase.from("kiosk_devices").insert({ name, user_id: data.user.id, ...enrollment });
  if (e2) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: "Could not save the device." };
  }
  refresh();
  return { code };
}

// Also how a device that lost its sign-in (cleared browser, new tablet) gets back in.
export async function newDeviceCode(id: string): Promise<CodeResult> {
  const { supabase } = await requireAdmin();
  const { code, ...enrollment } = newCode();
  const { error } = await supabase.from("kiosk_devices").update({ ...enrollment, revoked_at: null }).eq("id", id);
  if (error) return { error: "Could not make a code." };
  refresh();
  return { code };
}

export async function revokeDevice(id: string) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("kiosk_devices")
    .update({ revoked_at: new Date().toISOString(), enrollment_code_hash: null, enrollment_expires_at: null })
    .eq("id", id);
  if (error) throw new Error("Could not revoke.");
  refresh();
}
