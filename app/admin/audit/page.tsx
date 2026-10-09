import { Suspense } from "react";
import Link from "next/link";
import { getStaff } from "../../reception/staff";
import { describe, type AuditRow } from "./describe";

const LIMIT = 300;
const FILTERS = {
  all: "Everything", visits: "Visits", staff: "Staff", kiosk_devices: "Desk devices",
  invites: "Invites", watchlist: "Watchlist", roll_calls: "Roll calls",
} as const;

export default function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4 lg:py-8">
      <header className="flex items-center gap-4">
        <h1 className="h-display flex-1 text-[30px]">Audit log</h1>
        <Link href="/admin" className="btn-sm border-[1.5px] border-line-input bg-surface">Admin</Link>
      </header>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Audit searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Audit({ searchParams }: Pick<PageProps<"/admin/audit">, "searchParams">) {
  const { supabase, me } = await getStaff();
  if (me.role !== "admin") return <p className="text-ink-2">This page is for admins.</p>;
  const sp = await searchParams;
  const filter = (String(sp.e ?? "all") in FILTERS ? String(sp.e ?? "all") : "all") as keyof typeof FILTERS;

  let query = supabase.from("audit_log").select("id, at, actor, entity, action, changes").order("at", { ascending: false }).limit(LIMIT);
  if (filter === "roll_calls") query = query.in("entity", ["roll_calls", "roll_call_marks"]);
  else if (filter === "visits") query = query.in("entity", ["visits", "visit_guests"]);
  else if (filter !== "all") query = query.eq("entity", filter);
  const [{ data }, { data: staff }, { data: devices }] = await Promise.all([
    query,
    supabase.from("staff").select("id, full_name"),
    supabase.from("kiosk_devices").select("user_id, name"),
  ]);
  const rows = (data ?? []) as (AuditRow & { id: number; at: string; actor: string | null })[];
  // Who: a staff member, a desk device, or the server (a visitor's phone, an email link, the daily job).
  const who = new Map<string, string>([
    ...(staff ?? []).map((s) => [s.id, s.full_name] as [string, string]),
    ...(devices ?? []).flatMap((d) => (d.user_id ? [[d.user_id, `Desk: ${d.name}`] as [string, string]] : [])),
  ]);
  const at = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

  return (
    <>
      <nav className="flex flex-wrap gap-2">
        {Object.entries(FILTERS).map(([k, label]) => (
          <Link key={k} href={k === "all" ? "/admin/audit" : `/admin/audit?e=${k}`} aria-current={k === filter ? "page" : undefined}
            className={`chip flex items-center ${k === filter ? "border-brand bg-brand text-white" : ""}`}>{label}</Link>
        ))}
      </nav>
      <section className="overflow-hidden rounded-2xl border border-[#E3EAE6] bg-surface">
        <p className="border-b border-[#EEF2EF] px-4 py-3 text-[13.5px] text-ink-2">
          {rows.length === LIMIT ? `Newest ${LIMIT} events.` : `${rows.length} events.`} Recorded by the database itself, so every change is here, however it was made.
        </p>
        {rows.length === 0 && <p className="px-4 py-8 text-center text-muted">Nothing yet.</p>}
        <ul>
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap gap-x-4 gap-y-0.5 border-b border-[#F1F4F2] px-4 py-2.5 last:border-b-0">
              <span className="w-32 shrink-0 text-[13px] tabular-nums text-muted">{at(r.at)}</span>
              <span className="min-w-0 flex-1 text-[14.5px]">{describe(r)}</span>
              <span className="text-[13px] font-medium text-ink-2">{r.actor ? who.get(r.actor) ?? "Former user" : "System / visitor"}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
