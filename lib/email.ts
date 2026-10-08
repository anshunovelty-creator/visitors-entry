import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";

// Sends through Resend's HTTP API when RESEND_API_KEY is set. Without it: printed to the terminal
// in development, and reported as an error in production so the lobby shows "Resend".
// Returns an error message, or null when sent.
export async function sendEmail(to: string, subject: string, text: string): Promise<string | null> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") return "Email isn't set up (RESEND_API_KEY).";
    console.log(`\n[email] to ${to}\n[email] ${subject}\n${text}\n`);
    return null;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "Novelty Labels Visitors <onboarding@resend.dev>", to, subject, text }),
    });
    if (res.ok) return null;
    const body = await res.json().catch(() => ({}));
    return `Email failed: ${body.message ?? res.status}`;
  } catch {
    return "Email failed: network error";
  }
}

// The site's own address, for links in emails. Taken from the request so preview and
// production deployments each link to themselves.
export async function siteOrigin() {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}

// "Your visitor has arrived." Records the outcome on the visit either way, so the lobby can offer Resend.
export async function notifyHost(visitId: string) {
  const admin = createAdminClient();
  const { data: v } = await admin
    .from("visits")
    .select("visitor_name, company, purpose, checked_in_at, status, host:staff!visits_host_id_fkey(full_name, email, active), visit_guests(full_name)")
    .eq("id", visitId)
    .maybeSingle();
  const host = v?.host as unknown as { full_name: string; email: string; active: boolean } | null;
  if (!v || v.status !== "checked_in" || !host?.active) return; // "Reception" visits have no one to tell.

  const guests = (v.visit_guests as { full_name: string }[]).map((g) => g.full_name);
  const at = new Date(v.checked_in_at!).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
  const lines = [
    `Hi ${host.full_name.split(" ")[0]},`,
    "",
    `${v.company ? `${v.visitor_name} (${v.company})` : v.visitor_name} checked in at reception at ${at}.`,
    ...(v.purpose ? [`Purpose: ${v.purpose}`] : []),
    ...(guests.length ? [`With them: ${guests.join(", ")}`] : []),
    "",
    `Their details and photo: ${await siteOrigin()}/reception/visit/${visitId}`,
  ];
  const error = await sendEmail(host.email, `${v.visitor_name} is here to see you`, lines.join("\n"));
  await admin.from("visits").update(
    error ? { host_email_error: error } : { host_email_sent_at: new Date().toISOString(), host_email_error: null },
  ).eq("id", visitId);
}
