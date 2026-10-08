// Runs the migration on an in-memory Postgres (PGlite) with minimal stand-ins for Supabase's
// auth and storage schemas, then checks the access rules. `npm run test:db`.
// ponytail: stand-ins, not real Supabase; the hosted-project RLS suite in the spec still applies.
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const dir = new URL("./migrations/", import.meta.url);

await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  create publication supabase_realtime;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  grant all on all tables in schema storage to anon, authenticated;
  -- Supabase grants these by default; the migration must revoke what it doesn't want exposed.
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`);
for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(new URL(f, dir), "utf8"));

// ---- fixtures
const id = async (email) => (await db.query("insert into auth.users (email) values ($1) returning id", [email])).rows[0].id;
const [admin, reception, rahul, neha, device, revoked] = await Promise.all(
  ["admin@x", "desk@x", "rahul@x", "neha@x", "kiosk1@devices", "kiosk2@devices"].map(id),
);
await db.query(
  `insert into public.staff (id, full_name, email, role, department) values
   ($1,'Asha Admin','admin@x','admin',null), ($2,'Rita Reception','desk@x','reception',null),
   ($3,'Rahul Mehta','rahul@x','host','Sales'), ($4,'Neha Kapoor','neha@x','host','Quality')`,
  [admin, reception, rahul, neha],
);
await db.query(
  `insert into public.kiosk_devices (name, user_id, revoked_at) values ('Front desk', $1, null), ('Old tablet', $2, now())`,
  [device, revoked],
);

async function as(uid, sql, params) {
  await db.query("select set_config('test.uid', $1, false)", [uid ?? ""]);
  await db.exec(`set role ${uid ? "authenticated" : "anon"}`);
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec("reset role");
  }
}
const rejects = (p, re) => assert.rejects(p, re);
const photo = "desk/0b6c1f3e-8a2b-4c3d-9e4f-5a6b7c8d9e0f.jpg";
const checkIn = (uid, name, host, guests = [], path = photo) =>
  as(uid, "select * from public.kiosk_check_in($1, 'Acme', null, 'Meeting', $2, $3, $4)", [name, host, guests, path]);

// ---- desk device
const hosts = await as(device, "select * from public.kiosk_search_hosts('rah')");
assert.deepEqual(hosts.map((h) => h.full_name), ["Rahul Mehta"]);
assert.deepEqual(Object.keys(hosts[0]).sort(), ["department", "full_name", "id"], "no email exposed");

const [visit] = await checkIn(device, "Priya Sharma", rahul, ["Amit Shah"]);
assert.equal(visit.host_name, "Rahul Mehta");
const [toReception] = await checkIn(device, "Walk In", null);
assert.equal(toReception.host_name, null);

await rejects(checkIn(device, "X", rahul, [], "other/evil.jpg"), /bad photo path/);
await rejects(checkIn(device, "  ", rahul), /name is required/);
await rejects(checkIn(device, "X", rahul, ["Ok", " "]), /every guest/);

assert.equal((await as(device, "select * from public.visits")).length, 0, "device can't read visits");
assert.equal((await as(device, "select * from public.staff")).length, 0, "device can't read staff");
await rejects(as(null, "select * from public.kiosk_search_hosts('rah')"), /permission denied/);
await rejects(as(revoked, "select * from public.kiosk_search_hosts('rah')"), /revoked/);
await rejects(checkIn(reception, "X", rahul), /not enrolled/);

assert.equal((await as(device, "select * from public.kiosk_find_open_visits('pr')")).length, 0, "needs 3 letters");
const open = await as(device, "select * from public.kiosk_find_open_visits('pri')");
assert.deepEqual(open.map((v) => [v.visitor, v.host, v.guests]), [["Priya S.", "Rahul M.", 1]]);

// ---- staff access
assert.equal((await as(rahul, "select * from public.visits")).length, 1, "host sees own visitor");
assert.equal((await as(neha, "select * from public.visits")).length, 0, "other host sees nothing");
assert.equal((await as(reception, "select * from public.visits")).length, 2, "reception sees all");
assert.equal((await as(rahul, "update public.visits set purpose = 'x' returning id")).length, 0, "host can't edit");
await rejects(as(rahul, "select public.staff_sign_out($1)", [visit.visit_id]), /reception only/);

const [amit] = await as(reception, "select id from public.visit_guests where full_name = 'Amit Shah'");
await as(reception, "select public.staff_sign_out($1, $2)", [visit.visit_id, amit.id]);
assert.equal((await as(device, "select * from public.kiosk_find_open_visits('pri')"))[0].guests, 0, "guest left alone");

const signOut = async () => (await as(device, "select public.kiosk_sign_out($1) as ok", [visit.visit_id]))[0].ok;
assert.equal(await signOut(), true);
assert.equal(await signOut(), false, "already out");

// Yesterday's visitor stays for reception; the desk device can't find or close it.
const [old] = (await db.query(
  `insert into public.visits (visitor_name, source, status, checked_in_at) values ('Priyanka Old', 'desk', 'checked_in', now() - interval '2 days') returning id`,
)).rows;
assert.equal((await as(device, "select * from public.kiosk_find_open_visits('pri')")).length, 0);
assert.equal((await as(device, "select public.kiosk_sign_out($1) as ok", [old.id]))[0].ok, false);

// ---- photos
await as(device, "insert into storage.objects (bucket_id, name) values ('visit-photos', $1)", [photo]);
assert.equal((await as(device, "select * from storage.objects")).length, 0, "device can't read photos");
await rejects(as(device, "insert into storage.objects (bucket_id, name) values ('visit-photos', 'x/y.jpg')"), /row-level security/);
await rejects(as(rahul, "insert into storage.objects (bucket_id, name) values ('visit-photos', 'desk/y.jpg')"), /row-level security/);
assert.equal((await as(reception, "select * from storage.objects")).length, 1, "reception sees photos");
assert.equal((await as(rahul, "select * from storage.objects")).length, 1, "host sees own visitor's photo");
assert.equal((await as(neha, "select * from storage.objects")).length, 0, "other host doesn't");

// ---- invites
await db.query(
  `insert into public.invites (host_id, visitor_name, visitor_company, visit_date, purpose, code) values
   ($1, 'Ina Invite', 'Acme', public.office_today(), 'Meeting', 'ABC234'),
   ($1, 'Tom Tomorrow', null, public.office_today() + 1, null, 'TMR234'),
   ($1, 'Rex Reception', null, public.office_today(), null, 'REC234')`,
  [rahul],
);
await db.query("insert into public.invite_guests (invite_id, full_name) select id, 'Gina Guest' from public.invites where code = 'ABC234'");
const [inv] = await as(device, "select * from public.kiosk_redeem_invite('abc-234')");
assert.deepEqual([inv.visitor_name, inv.host_name, inv.guests], ["Ina Invite", "Rahul Mehta", ["Gina Guest"]]);
assert.equal((await as(device, "select * from public.kiosk_redeem_invite('TMR234')")).length, 0, "only on the invite date");
await rejects(as(null, "select * from public.kiosk_redeem_invite('ABC234')"), /permission denied/);
await rejects(as(rahul, "select * from public.redeem_invite('ABC234')"), /permission denied/, "core is server-only");
await rejects(as(reception, "select * from public.create_visit('reception', null, 'X', null, null, null, null, null, null)"), /permission denied/);

// The invite decides the host, and works once.
const [fromInvite] = await as(device,
  "select * from public.kiosk_check_in('Ina Invite', 'Acme', null, 'Meeting', null, array['Gina Guest'], $1, $2)", [photo, inv.invite_id]);
assert.equal(fromInvite.host_name, "Rahul Mehta");
assert.equal((await db.query("select status from public.invites where code = 'ABC234'")).rows[0].status, "used");
await rejects(as(device, "select * from public.kiosk_check_in('Ina Invite', null, null, null, null, null, null, $1)", [inv.invite_id]), /invite not valid/);

// Reception's one-click check-in for an expected visitor.
const [rex] = (await db.query("select id from public.invites where code = 'REC234'")).rows;
await rejects(as(rahul, "select public.staff_check_in_invite($1)", [rex.id]), /reception only/);
const [{ v: rexVisit }] = await as(reception, "select public.staff_check_in_invite($1) as v", [rex.id]);
const [rv] = (await db.query("select source, status, host_id, checked_in_by from public.visits where id = $1", [rexVisit])).rows;
assert.deepEqual([rv.source, rv.status, rv.host_id, rv.checked_in_by], ["reception", "checked_in", rahul, reception]);

// ---- own phone (server code, as service_role)
async function asService(sql, params) {
  await db.exec("set role service_role");
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role"); }
}
const phoneCall = "select * from public.create_visit('own_phone', null, 'Pat Phone', null, null, null, $1, null, $2, null, 'tokhash', 'iphash')";
const [pv] = await asService(phoneCall, [neha, "phone/0b6c1f3e-8a2b-4c3d-9e4f-5a6b7c8d9e0f.jpg"]);
assert.equal(pv.status, "arriving");
assert.match(pv.code, /^[1-9][0-9]{2}$/);
await rejects(asService(phoneCall, [neha, photo]), /bad photo path/, "phone can't claim a desk photo");
await rejects(asService("select * from public.create_visit('desk', null, $1, null, null, null, null, null, null)", ["x".repeat(121)]), /too long/);

// ---- host approval
const respond = (uid, id, r) => as(uid, "select public.host_respond($1, $2) as ok", [id, r]);
assert.equal((await respond(rahul, fromInvite.visit_id, "coming"))[0].ok, true, "host answers for own visitor");
assert.equal((await db.query("select host_response from public.visits where id = $1", [fromInvite.visit_id])).rows[0].host_response, "coming");
assert.equal((await respond(neha, fromInvite.visit_id, "unavailable"))[0].ok, false, "not someone else's");
assert.equal((await respond(reception, fromInvite.visit_id, "unavailable"))[0].ok, false, "reception isn't the host");
assert.equal((await respond(device, fromInvite.visit_id, "unavailable"))[0].ok, false, "nor is the desk");
assert.equal((await respond(rahul, visit.visit_id, "coming"))[0].ok, false, "not after they've left");
await rejects(respond(null, fromInvite.visit_id, "coming"), /permission denied/);

// ---- helpers
const short = async (n) => (await db.query("select public.short_name($1) as s", [n])).rows[0].s;
assert.equal(await short("Priya"), "Priya");
assert.equal(await short("Mary Ann Lee"), "Mary L.");

console.log("db: all checks passed");
