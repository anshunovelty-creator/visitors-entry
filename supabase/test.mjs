// Runs the migration on an in-memory Postgres (PGlite) with minimal stand-ins for Supabase's
// auth and storage schemas, then checks the access rules. `npm run test:db`.
// ponytail: stand-ins, not real Supabase; the hosted-project RLS suite in the spec still applies.
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const dir = new URL("./migrations/", import.meta.url);

await db.exec(`
  create role anon; create role authenticated;
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
  grant usage on schema public, auth, storage to anon, authenticated;
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

// ---- helpers
const short = async (n) => (await db.query("select public.short_name($1) as s", [n])).rows[0].s;
assert.equal(await short("Priya"), "Priya");
assert.equal(await short("Mary Ann Lee"), "Mary L.");

console.log("db: all checks passed");
