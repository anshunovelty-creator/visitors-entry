import { Suspense } from "react";
import { getStaff } from "../staff";
import { cancelInvite } from "./actions";
import { InviteForm } from "./form";

type Invite = {
  id: string;
  visitor_name: string;
  visitor_company: string | null;
  visit_date: string;
  code: string;
  status: "pending" | "used" | "cancelled";
  host: { full_name: string } | null;
  invite_guests: { count: number }[];
};

const STATUS = { pending: "Expected", used: "Checked in", cancelled: "Cancelled" } as const;

export default function InvitesPage() {
  return (
    <main className="flex min-w-0 flex-1 flex-col gap-5 p-4 lg:px-8 lg:py-7">
      <h1 className="h-display text-[30px]">Invites</h1>
      <Suspense fallback={<p className="text-muted">Loading invites…</p>}>
        <Invites />
      </Suspense>
    </main>
  );
}

async function Invites() {
  const { supabase, isReception } = await getStaff();
  const { data: today } = await supabase.rpc("office_today");
  const weekAgo = new Date(Date.parse(`${today}T00:00:00+05:30`) - 7 * 86_400_000).toISOString().slice(0, 10);
  // RLS: hosts see their own invites, reception sees everyone's.
  const { data } = await supabase.from("invites")
    .select("id, visitor_name, visitor_company, visit_date, code, status, host:staff!invites_host_id_fkey(full_name), invite_guests(count)")
    .gte("visit_date", weekAgo)
    .order("visit_date").order("visitor_name")
    .limit(200);
  const invites = (data ?? []) as unknown as Invite[];
  const day = (d: string) => (d === today ? "Today"
    : new Date(`${d}T12:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }));

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-[#E3EAE6] bg-surface">
        <h2 className="h-display border-b border-[#EEF2EF] px-4 py-3.5 text-[17px]">Invite a visitor</h2>
        <InviteForm today={today} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#E3EAE6] bg-surface">
        <h2 className="h-display border-b border-[#EEF2EF] px-4 py-3.5 text-[17px]">{isReception ? "All invites" : "Your invites"}</h2>
        {invites.length === 0 && <p className="px-4 py-8 text-center text-muted">No invites yet.</p>}
        <ul>
          {invites.map((i) => {
            const guests = i.invite_guests[0]?.count ?? 0;
            const past = i.visit_date < today;
            return (
              <li key={i.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[#F1F4F2] px-4 py-3 last:border-b-0 ${past || i.status !== "pending" ? "opacity-60" : ""}`}>
                <span className="w-24 shrink-0 text-[13.5px] font-semibold">{day(i.visit_date)}</span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[15px]">{i.visitor_name}{guests > 0 && ` +${guests}`}</b>
                  <span className="block truncate text-[13px] text-muted">
                    {[i.visitor_company, isReception && `host ${i.host?.full_name}`].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="font-display text-[15px] font-semibold tracking-[.15em] text-brand">{i.code.slice(0, 3)}-{i.code.slice(3)}</span>
                <span className="rounded-full bg-[#EEF2EF] px-2.5 py-0.5 text-xs font-semibold text-ink-2">
                  {past && i.status === "pending" ? "Didn't come" : STATUS[i.status]}
                </span>
                {i.status === "pending" && !past && (
                  <form action={cancelInvite.bind(null, i.id)}><button className="btn-sm text-danger">Cancel</button></form>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
