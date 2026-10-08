import { Suspense } from "react";
import Link from "next/link";
import { MailCheck, MailWarning, TriangleAlert, Users } from "lucide-react";
import { checkInExpected, confirmArrival, declineArrival, resendHostEmail, signOutVisit } from "./actions";
import { HostReply } from "./host-reply";
import { LiveRefresh } from "./live";
import { arrivingCutoff, clock, day, getStaff, initials, SOURCE } from "./staff";

type Visit = {
  id: string;
  visitor_name: string;
  company: string | null;
  photo_path: string | null;
  source: "desk" | "own_phone" | "reception";
  arrived_at: string;
  checked_in_at: string;
  code: string | null;
  host_email_sent_at: string | null;
  host_email_error: string | null;
  host_id: string | null;
  host_response: "coming" | "unavailable" | null;
  host: { full_name: string } | null;
  visit_guests: { id: string; full_name: string; checked_out_at: string | null }[];
};
type Expected = {
  id: string;
  visitor_name: string;
  visitor_company: string | null;
  host: { full_name: string } | null;
  invite_guests: { count: number }[];
};

const VISIT_FIELDS = "id, visitor_name, company, photo_path, source, arrived_at, checked_in_at, code, host_email_sent_at, host_email_error, host_id, host_response, host:staff!visits_host_id_fkey(full_name), visit_guests(id, full_name, checked_out_at)";

export default function ReceptionPage() {
  return (
    <Suspense fallback={<p className="p-8 text-muted">Loading the lobby…</p>}>
      <Lobby />
    </Suspense>
  );
}

async function Lobby() {
  const { supabase, me, isReception } = await getStaff();
  const cutoff = arrivingCutoff();
  // Own-phone arrivals nobody confirmed in time. Reception only; RLS makes it a no-op for hosts anyway.
  if (isReception) await supabase.from("visits").update({ status: "expired" }).eq("status", "arriving").lt("arrived_at", cutoff);

  const [{ data: dayStart }, { data: today }] = await Promise.all([supabase.rpc("office_day_start"), supabase.rpc("office_today")]);
  const [{ data: inData }, { data: arrData }, { data: expData }, { count: outToday }] = await Promise.all([
    supabase.from("visits").select(VISIT_FIELDS).eq("status", "checked_in").order("checked_in_at", { ascending: false }),
    supabase.from("visits").select(VISIT_FIELDS).eq("status", "arriving").gte("arrived_at", cutoff).order("arrived_at"),
    supabase.from("invites").select("id, visitor_name, visitor_company, host:staff!invites_host_id_fkey(full_name), invite_guests(count)")
      .eq("status", "pending").eq("visit_date", today).order("visitor_name"),
    supabase.from("visits").select("id", { count: "exact", head: true }).eq("status", "checked_out").gte("checked_out_at", dayStart),
  ]);
  const visits = (inData ?? []) as unknown as Visit[];
  const arriving = (arrData ?? []) as unknown as Visit[];
  const expected = (expData ?? []) as unknown as Expected[];
  const inside = visits.reduce((n, v) => n + 1 + v.visit_guests.filter((g) => !g.checked_out_at).length, 0);

  const paths = [...visits, ...arriving].flatMap((v) => (v.photo_path ? [v.photo_path] : []));
  const { data: signed } = paths.length
    ? await supabase.storage.from("visit-photos").createSignedUrls(paths, 300)
    : { data: [] };
  const photo = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const avatar = (v: Visit) => (
    <span className="grid size-[46px] shrink-0 place-items-center overflow-hidden rounded-[10px] bg-[#D9E4DE] font-display text-ink-2">
      {v.photo_path && photo.get(v.photo_path)
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL; must not be cached by the image optimiser
        ? <img src={photo.get(v.photo_path)!} alt={`Photo of ${v.visitor_name}`} className="size-full object-cover" />
        : initials(v.visitor_name)}
    </span>
  );

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-5 p-4 lg:px-8 lg:py-7">
      <LiveRefresh />
      <header>
        <h1 className="h-display text-[30px]">{isReception ? "Lobby" : "My visitors"}</h1>
        <p className="mt-0.5 flex items-center gap-2 text-[13.5px] text-ink-2">
          <span className="size-2 rounded-full bg-[#16A34A] shadow-[0_0_0_4px_rgba(22,163,74,.15)]" /> Live
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3.5 lg:max-w-3xl lg:grid-cols-4">
        <Stat label="In the building" value={inside} note="people" />
        <Stat label="Arriving" value={arriving.length} note="to confirm" />
        <Stat label="Expected today" value={expected.length} note="invites" />
        <Stat label="Signed out today" value={outToday ?? 0} note="visits" />
      </section>

      {arriving.length > 0 && (
        <section className="overflow-hidden rounded-2xl border-[1.5px] border-warn bg-warn-bg/40">
          <h2 className="h-display border-b border-warn/30 px-4 py-3.5 text-[17px]">Arriving: match the code on their phone</h2>
          <ul>
            {arriving.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-3 border-b border-warn/20 px-4 py-3 last:border-b-0">
                {avatar(v)}
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[15px]">{v.visitor_name}{v.visit_guests.length > 0 && ` +${v.visit_guests.length}`}</b>
                  <span className="block truncate text-[13px] text-ink-2">
                    {[v.company, `visiting ${v.host?.full_name ?? "Reception"}`, `since ${clock(v.arrived_at)}`].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {v.host && <HostReply visitId={v.id} response={v.host_response} mine={v.host_id === me.id} />}
                <span className="rounded-lg bg-surface px-3 py-1 font-display text-2xl font-semibold tracking-[.12em] text-brand" aria-label={`Code ${v.code}`}>{v.code}</span>
                {isReception && (
                  <>
                    <form action={confirmArrival.bind(null, v.id)}><button className="btn-sm bg-brand text-white">Confirm</button></form>
                    <form action={declineArrival.bind(null, v.id)}><button className="btn-sm border-[1.5px] border-line-input bg-surface">Not here</button></form>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-[#E3EAE6] bg-surface">
        <h2 className="h-display border-b border-[#EEF2EF] px-4 py-3.5 text-[17px]">In the building</h2>
        {visits.length === 0 && (
          <p className="px-4 py-8 text-center text-muted">{isReception ? "No one is checked in right now." : "None of your visitors are here right now."}</p>
        )}
        <ul>
          {visits.map((v) => {
            const stale = dayStart && new Date(v.checked_in_at) < new Date(dayStart);
            const open = v.visit_guests.filter((g) => !g.checked_out_at);
            return (
              <li key={v.id} className={`border-b border-[#F1F4F2] px-4 py-3 last:border-b-0 ${stale ? "bg-[#FFFBEB]" : ""}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <Link href={`/reception/visit/${v.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-[10px] hover:bg-tint/60">
                    {avatar(v)}
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[15px]">
                        {v.visitor_name}
                        {open.length > 0 && <span className="ml-1.5 rounded-full bg-tint px-1.5 py-px align-middle text-[11.5px] font-bold text-brand">+{open.length}</span>}
                      </b>
                      <span className="block truncate text-[13px] text-muted">
                        {[v.company, `visiting ${v.host?.full_name ?? "Reception"}`].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </Link>
                  <span className="text-[13.5px] tabular-nums">
                    {stale
                      ? <span className="inline-flex items-center gap-1 font-semibold text-[#B45309]"><TriangleAlert className="size-4" />Since {day(v.checked_in_at)}</span>
                      : clock(v.checked_in_at)}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${v.source === "desk" ? "bg-tint text-brand" : "bg-warn-bg text-warn-ink"}`}>{SOURCE[v.source]}</span>
                  {v.host && <HostReply visitId={v.id} response={v.host_response} mine={v.host_id === me.id} />}
                  {v.host && (v.host_email_error
                    ? isReception
                      ? <form action={resendHostEmail.bind(null, v.id)}>
                          <button title={v.host_email_error} className="btn-sm gap-1 text-danger"><MailWarning className="size-4" />Resend</button>
                        </form>
                      : <MailWarning className="size-4 text-danger" aria-label="Host email failed" />
                    : v.host_email_sent_at && <MailCheck className="size-4 text-brand" aria-label="Host emailed" />)}
                  {isReception && (
                    <form action={signOutVisit.bind(null, v.id, undefined)}>
                      <button className="btn-sm border-[1.5px] border-line-input bg-surface">Sign out{open.length > 0 && " all"}</button>
                    </form>
                  )}
                </div>
                {open.length > 0 && (
                  <ul className="mt-2 ml-[58px] flex flex-col gap-1">
                    {open.map((g) => (
                      <li key={g.id} className="flex min-h-11 items-center gap-2 text-[13.5px]">
                        <Users className="size-4 text-muted" />
                        <span className="flex-1">{g.full_name}</span>
                        {isReception && (
                          <form action={signOutVisit.bind(null, v.id, g.id)}>
                            <button className="min-h-11 px-2 text-[13px] font-semibold text-brand">Sign out</button>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {expected.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-[#E3EAE6] bg-surface">
          <h2 className="h-display border-b border-[#EEF2EF] px-4 py-3.5 text-[17px]">Expected today</h2>
          <ul>
            {expected.map((i) => {
              const guests = i.invite_guests[0]?.count ?? 0;
              return (
                <li key={i.id} className="flex flex-wrap items-center gap-3 border-b border-[#F1F4F2] px-4 py-3 last:border-b-0">
                  <span className="av">{initials(i.visitor_name)}</span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[15px]">{i.visitor_name}{guests > 0 && ` +${guests}`}</b>
                    <span className="block truncate text-[13px] text-muted">
                      {[i.visitor_company, `visiting ${i.host?.full_name ?? "—"}`].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {isReception && (
                    <form action={checkInExpected.bind(null, i.id)}>
                      <button className="btn-sm border-[1.5px] border-line-input bg-surface">Check in</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}

function Stat({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="rounded-[14px] border border-[#E3EAE6] bg-surface px-4.5 py-4">
      <span className="text-[13px] font-medium text-ink-2">{label}</span>
      <b className="mt-1 block font-display text-[34px] leading-none font-semibold tabular-nums">{value}</b>
      <span className="text-[12.5px] text-muted">{note}</span>
    </div>
  );
}
