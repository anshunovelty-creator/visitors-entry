import "server-only";
import { headers } from "next/headers";
import { after } from "next/server";
import nodemailer, { type Transporter } from "nodemailer";
import { createAdminClient } from "@/lib/supabase/server";
import { sign } from "@/lib/sign";
import { pushToStaff } from "@/lib/push";

// Sends over SMTP when SMTP_HOST is set (e.g. smtp.gmail.com, port 587, with an app password).
// Without it: printed to the terminal in development, and reported as an error in production so
// the lobby shows "Resend". Returns an error message, or null when sent.
type Extra = {
  html?: string;
  // Inline images: reference as <img src="cid:CONTENT_ID"> in the html. Without content_id it's a
  // plain attachment (e.g. a calendar file).
  attachments?: { filename: string; content: string /* base64 */; content_id?: string; contentType?: string }[];
};

let transport: Transporter | undefined;
function smtp() {
  const port = Number(process.env.SMTP_PORT || 587);
  return transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 is TLS from the start; 587 upgrades with STARTTLS
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    // A slow mail server mustn't hold up a check-in for minutes.
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
  });
}

export async function sendEmail(to: string, subject: string, text: string, extra: Extra = {}): Promise<string | null> {
  if (!process.env.SMTP_HOST) {
    if (process.env.NODE_ENV === "production") return "Email isn't set up (SMTP_HOST).";
    console.log(`\n[email] to ${to}\n[email] ${subject}\n${text}\n`);
    return null;
  }
  try {
    await smtp().sendMail({
      from: process.env.EMAIL_FROM || `Novelty Labels Visitors <${process.env.SMTP_USER}>`,
      to, subject, text, html: extra.html,
      attachments: extra.attachments?.map((a) => ({ filename: a.filename, content: a.content, encoding: "base64", cid: a.content_id, contentType: a.contentType })),
    });
    return null;
  } catch (e) {
    return `Email failed: ${e instanceof Error ? e.message : "unknown error"}`.slice(0, 200);
  }
}

// The site's own address, for links in emails. Taken from the request so preview and
// production deployments each link to themselves.
export async function siteOrigin() {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}

// The host's approval. "coming" = approved, the visitor may go in (the name predates approval);
// "unavailable" = declined. null = still waiting.
export type HostResponse = "coming" | "unavailable";

// Server-only secret for the host's approve/decline links. Its own variable if set, else the service-role key,
// which never leaves the server either. Changing it invalidates links already emailed.
export const linkSecret = () => process.env.HOST_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY!;

// One-click reply from the email, no sign-in needed: the link is signed for this visit and this answer.
const responseLink = (origin: string, visitId: string, response: HostResponse) =>
  `${origin}/respond/${visitId}?r=${response}&s=${sign(linkSecret(), visitId, response)}`;

// "Your visitor is waiting for your approval", by email and push to the host's phone. Sent after the
// response, so a slow mail server never holds up a check-in; the email outcome lands on the visit
// either way (realtime updates the lobby, which can offer Resend).
export async function notifyHost(visitId: string, { reminder = false } = {}) {
  const origin = await siteOrigin();
  after(() => alertHost(visitId, origin, reminder));
}

async function alertHost(visitId: string, origin: string, reminder: boolean) {
  const admin = createAdminClient();
  const { data: v } = await admin
    .from("visits")
    .select("visitor_name, company, purpose, checked_in_at, status, host_id, host:staff!visits_host_id_fkey(full_name, email, active), visit_guests(full_name)")
    .eq("id", visitId)
    .maybeSingle();
  const host = v?.host as unknown as { full_name: string; email: string; active: boolean } | null;
  if (!v || v.status !== "checked_in" || !host?.active) return; // "Reception" visits have no one to tell.

  const guests = (v.visit_guests as { full_name: string }[]).map((g) => g.full_name);
  const at = new Date(v.checked_in_at!).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
  const lines = [
    `Hi ${host.full_name.split(" ")[0]},`,
    "",
    `${v.company ? `${v.visitor_name} (${v.company})` : v.visitor_name} checked in at reception at ${at} and is ${reminder ? "still " : ""}waiting for your approval to go in.`,
    ...(v.purpose ? [`Purpose: ${v.purpose}`] : []),
    ...(guests.length ? [`With them: ${guests.join(", ")}`] : []),
    "",
    `Approve (let them in): ${responseLink(origin, visitId, "coming")}`,
    `Decline:               ${responseLink(origin, visitId, "unavailable")}`,
    "",
    `Their details and photo: ${origin}/reception/visit/${visitId}`,
  ];
  const who = v.company ? `${v.visitor_name} (${v.company})` : v.visitor_name;
  const [error] = await Promise.all([
    sendEmail(host.email, `${reminder ? "Reminder: " : ""}${v.visitor_name} is ${reminder ? "still " : ""}waiting for your approval`, lines.join("\n")),
    pushToStaff(v.host_id!, {
      title: reminder ? `${who} is still waiting` : `${who} is here to see you`,
      body: guests.length ? `With ${guests.length} other${guests.length === 1 ? "" : "s"}. Approve to let them in.` : "Approve to let them in.",
      tag: visitId,
      url: `${origin}/reception`,
      actions: [
        { action: "approve", title: "Approve", url: responseLink(origin, visitId, "coming") },
        { action: "decline", title: "Decline", url: responseLink(origin, visitId, "unavailable") },
      ],
    }),
  ]);
  await admin.from("visits").update(
    error ? { host_email_error: error } : { host_email_sent_at: new Date().toISOString(), host_email_error: null },
  ).eq("id", visitId);
}

// "A parcel is waiting for you at reception", by email and push, after the response.
export async function notifyDelivery(deliveryId: string) {
  const origin = await siteOrigin();
  after(async () => {
    const { data: d } = await createAdminClient().from("deliveries")
      .select("recipient_id, carrier, description, tracking, received_at, recipient:staff!deliveries_recipient_id_fkey(full_name, email, active)")
      .eq("id", deliveryId).maybeSingle();
    const to = d?.recipient as unknown as { full_name: string; email: string; active: boolean } | null;
    if (!d || !to?.active) return;
    const what = [d.carrier, d.description].filter(Boolean).join(" · ") || "A parcel";
    const at = new Date(d.received_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
    await Promise.all([
      sendEmail(to.email, `Parcel at reception: ${what}`, [
        `Hi ${to.full_name.split(" ")[0]},`,
        "",
        `${what} arrived for you at ${at} and is waiting at reception.`,
        ...(d.tracking ? [`Tracking: ${d.tracking}`] : []),
        "",
        `Mark it collected when you pick it up: ${origin}/reception/deliveries`,
      ].join("\n")),
      pushToStaff(d.recipient_id, { title: "Parcel at reception", body: what, tag: `delivery-${deliveryId}`, url: `${origin}/reception/deliveries` }),
    ]);
  });
}
