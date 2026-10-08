// End-to-end check against the real Supabase project: password sign-in, device enrollment,
// desk check-in with photo, who-sees-what, sign-out, deactivation. Everything it creates is
// deleted at the end, pass or fail.   npm run test:live
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const client = () => createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

const tag = randomUUID().slice(0, 6);
const created = { users: [], devices: [], visits: [], photos: [] };
const password = `Smoke-${randomUUID()}`;

async function staff(name, role) {
  const email = `smoke-${tag}-${role}-${name.split(" ")[1].toLowerCase()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  created.users.push(data.user.id);
  const { error: e2 } = await admin.from("staff").insert({ id: data.user.id, email, full_name: name, role, department: "QA" });
  if (e2) throw e2;
  return { id: data.user.id, email };
}
async function signIn(email, pw = password) {
  const c = client();
  const { error } = await c.auth.signInWithPassword({ email, password: pw });
  return { c, error };
}

try {
  const hostA = await staff(`Zyx${tag} Alpha`, "host");
  const hostB = await staff(`Zyx${tag} Beta`, "host");
  const desk = await staff(`Zyx${tag} Desk`, "reception");

  // ---- password sign-in
  assert.ok((await signIn(hostA.email, "wrong-password")).error, "wrong password refused");
  const { c: a, error: ea } = await signIn(hostA.email);
  assert.ifError(ea);
  const { c: b } = await signIn(hostB.email);
  const { c: r } = await signIn(desk.email);

  // ---- device enrollment, the way /kiosk/enroll does it
  const { data: du } = await admin.auth.admin.createUser({ email: `kiosk-${randomUUID()}@devices.invalid`, email_confirm: true });
  created.users.push(du.user.id);
  const { data: dev } = await admin.from("kiosk_devices").insert({ name: `Smoke ${tag}`, user_id: du.user.id }).select("id").single();
  created.devices.push(dev.id);
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: du.user.email });
  const k = client();
  assert.ifError((await k.auth.verifyOtp({ type: "email", token_hash: link.properties.hashed_token })).error);
  const { data: who } = await k.rpc("kiosk_whoami").single();
  assert.equal(who.device_name, `Smoke ${tag}`);

  // ---- desk check-in
  const { data: found } = await k.rpc("kiosk_search_hosts", { q: `Zyx${tag}` });
  assert.deepEqual(found.map((h) => h.full_name).sort(), [`Zyx${tag} Alpha`, `Zyx${tag} Beta`, `Zyx${tag} Desk`]);
  assert.ok(!("email" in found[0]), "kiosk never sees emails");

  const photo = `desk/${randomUUID()}.jpg`;
  const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==", "base64");
  assert.ifError((await k.storage.from("visit-photos").upload(photo, jpeg, { contentType: "image/jpeg" })).error);
  created.photos.push(photo);
  assert.ok((await k.storage.from("visit-photos").createSignedUrl(photo, 60)).error, "device can't read photos back");

  const { data: [visit], error: ec } = await k.rpc("kiosk_check_in", {
    p_visitor_name: `Smoke Visitor ${tag}`, p_company: "Smoke Co", p_mobile: "+91 90000 00000",
    p_purpose: "Smoke test", p_host_id: hostA.id, p_guests: ["Guest One"], p_photo_path: photo,
  });
  assert.ifError(ec);
  created.visits.push(visit.visit_id);
  assert.equal(visit.host_name, `Zyx${tag} Alpha`);

  // ---- who sees what (same select as /reception/visit/[id])
  const detail = (c) => c.from("visits")
    .select("id, visitor_name, mobile, purpose, status, photo_path, host:staff!visits_host_id_fkey(full_name, department), visit_guests(id, full_name, checked_out_at)")
    .eq("id", visit.visit_id).maybeSingle();
  const seenByA = (await detail(a)).data;
  assert.equal(seenByA?.mobile, "+91 90000 00000", "host sees their visitor's details");
  assert.equal(seenByA.host.full_name, `Zyx${tag} Alpha`);
  assert.equal((await detail(b)).data, null, "other host can't see it");
  assert.ok((await detail(r)).data, "reception sees it");
  assert.equal((await detail(k)).data, null, "device can't read visits");

  assert.ok((await a.storage.from("visit-photos").createSignedUrl(photo, 60)).data?.signedUrl, "host sees the photo");
  assert.ok((await b.storage.from("visit-photos").createSignedUrl(photo, 60)).error, "other host doesn't");

  // Same search shape as /reception/log.
  const log = (c, q) => c.from("visits").select("id").or(`visitor_name.ilike.*${q}*,company.ilike.*${q}*`).eq("id", visit.visit_id);
  assert.equal((await log(r, "Smoke Co")).data.length, 1);
  assert.equal((await log(b, "Smoke Co")).data.length, 0, "log respects RLS too");

  // ---- sign-out
  assert.ok((await a.rpc("staff_sign_out", { p_visit_id: visit.visit_id })).error, "hosts can't sign out");
  assert.ifError((await r.rpc("staff_sign_out", { p_visit_id: visit.visit_id, p_guest_id: seenByA.visit_guests[0].id })).error);
  const { data: open } = await k.rpc("kiosk_find_open_visits", { q: `Smoke Visitor ${tag}` });
  assert.equal(open[0]?.guests, 0, "guest signed out alone");
  assert.equal((await k.rpc("kiosk_sign_out", { p_visit_id: visit.visit_id })).data, true);
  assert.equal((await detail(r)).data.status, "checked_out");

  // ---- invites: host creates (RLS), desk redeems, invite decides the host and works once
  const { data: today } = await a.rpc("office_today");
  const code = `T${tag.slice(0, 5).toUpperCase().replace(/[^A-Z0-9]/g, "Z")}`;
  const { data: inv, error: ei } = await a.from("invites")
    .insert({ host_id: hostA.id, visitor_name: `Ina ${tag}`, visit_date: today, code }).select("id").single();
  assert.ifError(ei);
  assert.ok((await b.from("invites").insert({ host_id: hostA.id, visitor_name: "x", visit_date: today, code: "XXXXXX" })).error, "can't invite for someone else");
  await a.from("invite_guests").insert({ invite_id: inv.id, full_name: "Gina Guest" });
  const { data: red } = await k.rpc("kiosk_redeem_invite", { p_code: `${code.slice(0, 3)}-${code.slice(3).toLowerCase()}` }).single();
  assert.deepEqual([red.host_name, red.guests], [`Zyx${tag} Alpha`, ["Gina Guest"]]);
  const { data: [fromInvite], error: eci } = await k.rpc("kiosk_check_in", {
    p_visitor_name: `Ina ${tag}`, p_company: "", p_mobile: "", p_purpose: "", p_host_id: hostB.id,
    p_guests: ["Gina Guest"], p_photo_path: null, p_invite_id: inv.id,
  });
  assert.ifError(eci);
  created.visits.push(fromInvite.visit_id);
  assert.equal(fromInvite.host_name, `Zyx${tag} Alpha`, "invite decides the host, not the form");
  assert.ok((await k.rpc("kiosk_check_in", { p_visitor_name: "again", p_company: "", p_mobile: "", p_purpose: "", p_host_id: null, p_guests: [], p_photo_path: null, p_invite_id: inv.id })).error, "invite works once");

  // ---- reception's one-click check-in of an expected visitor
  const { data: inv2 } = await a.from("invites").insert({ host_id: hostA.id, visitor_name: `Exp ${tag}`, visit_date: today, code: `E${code.slice(1)}` }).select("id").single();
  assert.ok((await a.rpc("staff_check_in_invite", { p_invite_id: inv2.id })).error, "hosts can't");
  const { data: v2, error: ev2 } = await r.rpc("staff_check_in_invite", { p_invite_id: inv2.id });
  assert.ifError(ev2);
  created.visits.push(v2);

  // ---- own phone: signed upload, arriving, reception confirms (as app/visit + confirmArrival do)
  const phonePath = `phone/${randomUUID()}.jpg`;
  const { data: signedUp } = await admin.storage.from("visit-photos").createSignedUploadUrl(phonePath);
  assert.ifError((await client().storage.from("visit-photos").uploadToSignedUrl(phonePath, signedUp.token, jpeg, { contentType: "image/jpeg" })).error);
  created.photos.push(phonePath);
  assert.ok((await a.rpc("create_visit", { p_source: "own_phone", p_device: null, p_visitor_name: "x", p_company: null, p_mobile: null, p_purpose: null, p_host_id: null, p_guests: [], p_photo_path: null })).error, "core is server-only");
  const { data: [pv], error: epv } = await admin.rpc("create_visit", {
    p_source: "own_phone", p_device: null, p_visitor_name: `Pat ${tag}`, p_company: "", p_mobile: "", p_purpose: "",
    p_host_id: hostA.id, p_guests: [], p_photo_path: phonePath, p_phone_token_hash: `smoke-${tag}`, p_origin_hash: `smoke-${tag}`,
  });
  assert.ifError(epv);
  created.visits.push(pv.visit_id);
  assert.equal(pv.status, "arriving");
  assert.match(pv.code, /^\d{3}$/);
  const confirm = (c) => c.from("visits").update({ status: "checked_in", checked_in_at: new Date().toISOString() })
    .eq("id", pv.visit_id).eq("status", "arriving").select("id");
  assert.equal((await confirm(a)).data.length, 0, "hosts can't confirm arrivals");
  assert.equal((await confirm(r)).data.length, 1, "reception confirms");

  // ---- host approval: only the visitor's own host can answer, from the app
  assert.equal((await b.rpc("host_respond", { p_visit_id: pv.visit_id, p_response: "unavailable" })).data, false, "not another host");
  assert.equal((await r.rpc("host_respond", { p_visit_id: pv.visit_id, p_response: "unavailable" })).data, false, "not reception");
  assert.equal((await a.rpc("host_respond", { p_visit_id: pv.visit_id, p_response: "coming" })).data, true);
  assert.equal((await r.from("visits").select("host_response").eq("id", pv.visit_id).single()).data.host_response, "coming", "reception sees the answer");

  // The public host search's exact or() filter, quoted so spaces and dots are safe.
  const term = `Zyx${tag}`;
  const { data: pub, error: epub } = await admin.from("staff").select("full_name").eq("active", true)
    .or(`full_name.ilike."${term}*",full_name.ilike."* ${term}*"`).limit(8);
  assert.ifError(epub);
  assert.equal(pub.length, 3);

  // ---- revoke device, deactivate staff (as /admin does)
  await admin.from("kiosk_devices").update({ revoked_at: new Date().toISOString() }).eq("id", dev.id);
  assert.ok((await k.rpc("kiosk_whoami").single()).error, "revoked device is locked out");
  await admin.from("staff").update({ active: false }).eq("id", hostB.id);
  await admin.auth.admin.updateUserById(hostB.id, { ban_duration: "876000h" });
  assert.ok((await signIn(hostB.email)).error, "deactivated staff can't sign in");

  console.log("live: all checks passed");
} finally {
  if (created.visits.length) await admin.from("visits").delete().in("id", created.visits);
  if (created.photos.length) await admin.storage.from("visit-photos").remove(created.photos);
  if (created.devices.length) await admin.from("kiosk_devices").delete().in("id", created.devices);
  for (const id of created.users) await admin.auth.admin.deleteUser(id);
}
