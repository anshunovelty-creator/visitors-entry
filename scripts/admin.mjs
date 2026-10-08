// Bootstrap: creates the first admin. Everything after that lives on /admin.
//   npm run admin -- staff <email> "<Full Name>" <host|reception|admin> <password> [department]
//   npm run admin -- password <email> <new password>
//   npm run admin -- kiosk "<Device name>"
import { createHash, randomInt, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const [cmd, ...args] = process.argv.slice(2);

if (cmd === "staff") {
  const [email, fullName, role, password, department = null] = args;
  if (!email || !fullName || !["host", "reception", "admin"].includes(role) || !(password?.length >= 8)) usage();
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) fail(error);
  const { error: e2 } = await db.from("staff").insert({ id: data.user.id, email, full_name: fullName, role, department });
  if (e2) fail(e2);
  console.log(`Added ${fullName} <${email}> as ${role}.`);
} else if (cmd === "password") {
  const [email, password] = args;
  if (!email || !(password?.length >= 8)) usage();
  const { data: row } = await db.from("staff").select("id").eq("email", email.toLowerCase()).maybeSingle();
  if (!row) fail(`No staff member with email ${email}`);
  const { error } = await db.auth.admin.updateUserById(row.id, { password });
  if (error) fail(error);
  console.log(`Password set for ${email}.`);
} else if (cmd === "kiosk") {
  const [name] = args;
  if (!name) usage();
  const { data, error } = await db.auth.admin.createUser({ email: `kiosk-${randomUUID()}@devices.invalid`, email_confirm: true });
  if (error) fail(error);
  // No 0/O/1/I/L, so the code reads cleanly off a screen.
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const code = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join("");
  const { error: e2 } = await db.from("kiosk_devices").insert({
    name,
    user_id: data.user.id,
    enrollment_code_hash: createHash("sha256").update(code).digest("hex"),
    enrollment_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (e2) fail(e2);
  console.log(`Enrollment code for "${name}": ${code.slice(0, 4)}-${code.slice(4)}  (valid 10 minutes, open /kiosk/enroll on the device)`);
} else {
  usage();
}

function usage() {
  console.error('Usage (passwords: 8+ characters):\n  npm run admin -- staff <email> "<Full Name>" <host|reception|admin> <password> [department]\n  npm run admin -- password <email> <new password>\n  npm run admin -- kiosk "<Device name>"');
  process.exit(1);
}
function fail(error) {
  console.error(error.message ?? error);
  process.exit(1);
}
