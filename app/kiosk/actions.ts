"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { notifyHost } from "@/lib/email";

// Called by the desk device right after a check-in. Only for a visit this device made in the
// last few minutes that hasn't been emailed yet, so it can't be used to spam hosts.
export async function notifyDeskCheckIn(visitId: string) {
  const supabase = await createClient();
  const { data: device } = await supabase.rpc("kiosk_whoami").maybeSingle<{ device_id: string }>();
  if (!device) return;
  const { data: visit } = await createAdminClient()
    .from("visits")
    .select("id")
    .eq("id", visitId)
    .eq("device_id", device.device_id)
    .is("host_email_sent_at", null)
    .gte("checked_in_at", new Date(Date.now() - 5 * 60_000).toISOString())
    .maybeSingle();
  if (visit) await notifyHost(visit.id);
}
