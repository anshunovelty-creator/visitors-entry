import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/server";

// Phone/desktop notifications through the browsers' push services, keyed by VAPID (see .env.example).
// The service worker (public/sw.js) shows them; actions open their url (e.g. a signed Approve link).
export type PushMessage = { title: string; body: string; tag: string; url: string; actions?: { action: string; title: string; url: string }[] };

// The server POSTs to whatever endpoint a browser hands over, so only the real push services count.
const PUSH_HOSTS = [/\.googleapis\.com$/, /\.mozilla\.com$/, /\.push\.apple\.com$/, /\.notify\.windows\.com$/];
export const isPushEndpoint = (url: string) => {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && PUSH_HOSTS.some((h) => h.test(u.hostname));
  } catch {
    return false;
  }
};

let ready = false;
function configured() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  if (!ready) webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:visitors@example.com", pub, priv);
  return (ready = true);
}

// Every browser where this staff member turned alerts on. Subscriptions the push service says are
// gone (404/410: uninstalled, permission revoked) are deleted.
export async function pushToStaff(staffId: string, msg: PushMessage) {
  if (!configured()) return;
  const admin = createAdminClient();
  const { data: subs } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth").eq("staff_id", staffId);
  await Promise.all((subs ?? []).filter((s) => isPushEndpoint(s.endpoint)).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg),
        { TTL: 600, urgency: "high", timeout: 10_000 });
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
    }
  }));
}
