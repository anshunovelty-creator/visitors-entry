"use server";

import { refresh } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { linkSecret, type HostResponse } from "@/lib/email";
import { verify } from "@/lib/sign";

// The host's reply from the email link. The signature is the permission: it names this visit and
// this answer, and only the server can make one.
export async function respondFromEmail(visitId: string, response: HostResponse, signature: string) {
  if (!["coming", "unavailable"].includes(response) || !verify(linkSecret(), visitId, response, signature)) {
    throw new Error("This link isn't valid.");
  }
  await createAdminClient().from("visits")
    .update({ host_response: response, host_responded_at: new Date().toISOString() })
    .eq("id", visitId).in("status", ["arriving", "checked_in"]);
  refresh();
}
