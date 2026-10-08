"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";

// ponytail: no rate limit; 31^8 codes alive for 10 minutes. Add one if enrollment is exposed beyond the office.
export async function enroll(_prev: string | null, form: FormData): Promise<string | null> {
  const code = String(form.get("code") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 8) return "Enter the 8-character code from the admin screen.";

  const admin = createAdminClient();
  const { data: device } = await admin
    .from("kiosk_devices")
    .select("id, user_id")
    .eq("enrollment_code_hash", createHash("sha256").update(code).digest("hex"))
    .gt("enrollment_expires_at", new Date().toISOString())
    .is("revoked_at", null)
    .maybeSingle();
  if (!device?.user_id) return "That code is wrong or has expired. Ask an admin for a new one.";

  const { data: user } = await admin.auth.admin.getUserById(device.user_id);
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: user.user!.email! });
  if (error) return "Could not sign this device in. Try again.";

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({ type: "email", token_hash: link.properties.hashed_token });
  if (verifyError) return "Could not sign this device in. Try again.";

  // Single use.
  await admin.from("kiosk_devices").update({ enrollment_code_hash: null, enrollment_expires_at: null }).eq("id", device.id);
  redirect("/kiosk");
}
