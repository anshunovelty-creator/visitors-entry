import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { revokeDevice, setStaffActive, updateStaff } from "./actions";
import { AddDeviceForm, AddStaffForm, DeviceCodeButton, ResetPasswordForm } from "./forms";

const TZ = "Asia/Kolkata";
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: TZ });

export default function AdminPage() {
  return (
    <Suspense fallback={<p className="p-8 text-muted">Loading…</p>}>
      <Admin />
    </Suspense>
  );
}

async function Admin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("staff").select("role, active").eq("id", user.id).maybeSingle();
  if (me?.role !== "admin" || !me.active) return <p className="p-8 text-ink-2">This page is for admins.</p>;

  const [{ data: staff }, { data: devices }] = await Promise.all([
    supabase.from("staff").select("id, full_name, email, department, role, active").order("active", { ascending: false }).order("full_name"),
    supabase.from("kiosk_devices").select("id, name, enrollment_code_hash, last_seen_at, revoked_at").order("created_at"),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 lg:py-8">
      <header className="flex items-center gap-4">
        <Image src="/logo.png" alt="Novelty Labels" width={136} height={34} className="h-8 w-auto" />
        <h1 className="h-display flex-1 text-[30px]">Admin</h1>
        <Link href="/reception" className="btn-sm border-[1.5px] border-line-input bg-surface">Lobby</Link>
      </header>

      <section className="overflow-hidden rounded-2xl border border-[#E3EAE6] bg-surface">
        <h2 className="h-display border-b border-[#EEF2EF] px-4 py-3.5 text-[17px]">Staff</h2>
        <ul>
          {(staff ?? []).map((s) => (
            <li key={s.id} className={`flex flex-col gap-3 border-b border-[#F1F4F2] px-4 py-3.5 ${s.active ? "" : "opacity-60"}`}>
              <div>
                <b className="text-[15px]">{s.full_name}</b>
                {s.id === user.id && <span className="ml-2 text-[12.5px] text-muted">(you)</span>}
                {!s.active && <span className="ml-2 rounded-full bg-warn-bg px-2 py-px text-[12px] font-semibold text-warn-ink">Deactivated</span>}
                <span className="block text-[13px] text-muted">{s.email}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <form action={updateStaff.bind(null, s.id)} className="flex flex-wrap items-center gap-2">
                  <select name="role" defaultValue={s.role} aria-label={`Role for ${s.full_name}`} className="input h-11 w-36">
                    <option value="host">Host</option>
                    <option value="reception">Reception</option>
                    <option value="admin">Admin</option>
                  </select>
                  <input name="department" defaultValue={s.department ?? ""} placeholder="Department"
                    aria-label={`Department for ${s.full_name}`} className="input h-11 w-40" />
                  <button className="btn-sm border-[1.5px] border-line-input bg-surface">Save</button>
                </form>
                <ResetPasswordForm id={s.id} />
                {s.id !== user.id && (
                  <form action={setStaffActive.bind(null, s.id, !s.active)}>
                    <button className={`btn-sm ${s.active ? "text-danger" : "text-brand"}`}>{s.active ? "Deactivate" : "Reactivate"}</button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
        <h3 className="h-display border-t border-[#EEF2EF] px-4 pt-4 text-[15px]">Add a staff member</h3>
        <AddStaffForm />
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#E3EAE6] bg-surface">
        <h2 className="h-display border-b border-[#EEF2EF] px-4 py-3.5 text-[17px]">Desk devices</h2>
        {(devices ?? []).length === 0 && <p className="px-4 py-6 text-center text-muted">No devices yet.</p>}
        <ul>
          {(devices ?? []).map((d) => (
            <li key={d.id} className="flex flex-wrap items-start gap-3 border-b border-[#F1F4F2] px-4 py-3.5">
              <span className="min-w-0 flex-1">
                <b className="block text-[15px]">{d.name}</b>
                <span className="text-[13px] text-muted">
                  {d.revoked_at ? `Revoked ${when(d.revoked_at)}`
                    : d.enrollment_code_hash ? "Waiting for enrollment"
                    : d.last_seen_at ? `Last used ${when(d.last_seen_at)}` : "Enrolled"}
                </span>
              </span>
              <DeviceCodeButton id={d.id} />
              {!d.revoked_at && (
                <form action={revokeDevice.bind(null, d.id)}>
                  <button className="btn-sm text-danger">Revoke</button>
                </form>
              )}
            </li>
          ))}
        </ul>
        <h3 className="h-display border-t border-[#EEF2EF] px-4 pt-4 text-[15px]">Add a device</h3>
        <AddDeviceForm />
      </section>
    </main>
  );
}
