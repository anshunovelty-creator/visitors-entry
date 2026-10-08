"use server";

import { randomInt } from "node:crypto";
import QRCode from "qrcode";
import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendEmail, siteOrigin } from "@/lib/email";

// No 0/O/1/I/L, so the code reads cleanly off an email and types easily at the desk.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
export type InviteResult = { code?: string; qrSvg?: string; emailed?: boolean; emailError?: string; error?: string } | null;

// Hosts invite their own visitors (RLS: host_id must be the caller). Reception can too, as host.
export async function createInvite(_prev: InviteResult, form: FormData): Promise<InviteResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Signed out. Sign in again." };
  const { data: today } = await supabase.rpc("office_today");

  const name = String(form.get("visitor_name") ?? "").trim().slice(0, 120);
  const email = String(form.get("visitor_email") ?? "").trim().toLowerCase().slice(0, 200);
  const company = String(form.get("visitor_company") ?? "").trim().slice(0, 120) || null;
  const purpose = String(form.get("purpose") ?? "").trim().slice(0, 60) || null;
  const date = String(form.get("visit_date") ?? "");
  const guests = String(form.get("guests") ?? "").split("\n").map((g) => g.trim().slice(0, 120)).filter(Boolean).slice(0, 20);
  if (!name) return { error: "Who are you inviting?" };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That email doesn't look right." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today) return { error: "Pick today or a later date." };

  let created: { id: string; code: string } | null = null;
  for (let tries = 0; !created && tries < 3; tries++) {
    const { data, error } = await supabase.from("invites")
      .insert({ host_id: user.id, visitor_name: name, visitor_email: email || null, visitor_company: company, visit_date: date, purpose, code: newCode() })
      .select("id, code").single();
    if (error && error.code !== "23505") return { error: "Could not create the invite." }; // 23505: code clash, try another
    created = data;
  }
  if (!created) return { error: "Could not create the invite. Try again." };
  const invite = created;
  if (guests.length) await supabase.from("invite_guests").insert(guests.map((full_name) => ({ invite_id: invite.id, full_name })));

  const pretty = `${invite.code.slice(0, 3)}-${invite.code.slice(3)}`;
  // The QR holds the check-in link: a phone camera opens it, the desk tablet's scanner reads the code from it.
  const link = `${await siteOrigin()}/visit?code=${invite.code}`;
  const qr = { margin: 1, errorCorrectionLevel: "M" as const, color: { dark: "#0e1f18", light: "#ffffff" } };
  const qrSvg = await QRCode.toString(link, { ...qr, type: "svg" });
  let emailError: string | undefined;
  if (email) {
    const { data: me } = await supabase.from("staff").select("full_name").eq("id", user.id).single();
    const when = new Date(`${date}T12:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" });
    const host = me?.full_name ?? "Your host";
    const png = (await QRCode.toBuffer(link, { ...qr, type: "png", width: 360 })).toString("base64");
    emailError = (await sendEmail(email, `Your visit to Novelty Labels on ${when}`, [
      `Hi ${name.split(" ")[0]},`,
      "",
      `${host} has invited you to Novelty Labels on ${when}.`,
      "",
      `Your check-in code: ${pretty}`,
      "",
      "When you arrive, check in on your phone with this link, or show the QR code in this email to the reception tablet:",
      link,
      "",
      "The code works once, on the day of your visit.",
    ].join("\n"), {
      html: inviteHtml({ first: escapeHtml(name.split(" ")[0]), host: escapeHtml(host), when, code: pretty, link }),
      attachments: [{ filename: "check-in-qr.png", content: png, content_id: "checkin-qr" }],
    })) ?? undefined;
  }
  refresh();
  return { code: pretty, qrSvg, emailed: !!email && !emailError, emailError };
}

const escapeHtml = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function inviteHtml({ first, host, when, code, link }: { first: string; host: string; when: string; code: string; link: string }) {
  return `<div style="font-family:system-ui,sans-serif;color:#0e1f18;max-width:480px">
<p>Hi ${first},</p>
<p>${host} has invited you to <b>Novelty Labels</b> on <b>${when}</b>.</p>
<p style="margin:24px 0 8px">Your check-in code</p>
<p style="font-size:30px;font-weight:700;letter-spacing:.15em;color:#10553f;margin:0">${code}</p>
<p style="margin:24px 0 8px">At reception, show this QR code to the tablet:</p>
<img src="cid:checkin-qr" width="180" height="180" alt="Check-in QR code ${code}" />
<p style="margin-top:20px"><a href="${link}" style="color:#10553f;font-weight:600">Or check in on your phone</a></p>
<p style="color:#6b7a72;font-size:13px">The code works once, on the day of your visit.</p>
</div>`;
}

export async function cancelInvite(id: string) {
  const supabase = await createClient();
  await supabase.from("invites").update({ status: "cancelled" }).eq("id", id).eq("status", "pending");
  refresh();
}
