import { Suspense } from "react";
import Link from "next/link";
import { Hourglass, MailCheck, MailWarning, Printer, ShieldAlert, TriangleAlert, Users } from "lucide-react";
import { checkInExpected, confirmArrival, declineArrival, resendHostEmail, signOutVisit } from "./actions";
import { HostReply } from "./host-reply";
import { LiveRefresh } from "./live";
import { LobbySearch } from "./search";
import { arrivingCutoff, clock, day, duration, getStaff, initials, minutesSince, officeDayStart, officeToday, OVERSTAY_HOURS, photoSrc, REMIND_MINUTES, SOURCE } from "./staff";

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
  watchlist: { reason: string } | null;
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

const VISIT_FIELDS = "id, visitor_name, company, photo_path, source, arrived_at, checked_in_at, code, host_email_sent_at, host_email_error, host_id, host_response, watchlist(reason), host:staff!visits_host_id_fkey(full_name), visit_guests(id, full_name, checked_out_at)";

export default function ReceptionPage({ searchParams }: PageProps<"/reception">) {
  return (
    <Suspense fallback={<p className="p-8 text-muted">Loading the lobby…</p>}>
      <Lobby searchParams={searchParams} />
    </Suspense>
  );
}

async function Lobby({ searchParams }: Pick<PageProps<"/reception">, "searchParams">) {
  const { supabase, me, isReception } = await getStaff();
  const rawQ = (await searchParams).q;
  const q = (Array.isArray(rawQ) ? rawQ[0] : rawQ ?? "").trim().slice(0, 100);
  // Visitor, company, host, anyone in the group, or the 3-digit code. Stat tiles stay unfiltered.
  const hit = (...fields: (string | null | undefined)[]) => !q || fields.some((f) => f?.toLowerCase().includes(q.toLowerCase()));
  const cutoff = arrivingCutoff();
  const dayStart = officeDayStart();
  const today = officeToday();
  // One round trip for everything the lobby shows.
  const [{ data: inData }, { data: arrData }, { data: expData }, { count: outToday }] = await Promise.all([
    supabase.from("visits").select(VISIT_FIELDS).eq("status", "checked_in").order("checked_in_at", { ascending: false }),
    supabase.from("visits").select(VISIT_FIELDS).eq("status", "arriving").gte("arrived_at", cutoff).order("arrived_at"),
    supabase.from("invites").select("id, visitor_name, visitor_company, host:staff!invites_host_id_fkey(full_name), invite_guests(count)")
      .eq("status", "pending").eq("visit_date", today).order("visitor_name"),
    supabase.from("visits").select("id", { count: "exact", head: true }).eq("status", "checked_out").gte("checked_out_at", dayStart),
    // Own-phone arrivals nobody confirmed in time. Reception only (RLS makes it a no-op for hosts);
    // safe to run alongside, since the Arriving query above already leaves them out by time.
    isReception ? supabase.from("visits").update({ status: "expired" }).eq("status", "arriving").lt("arrived_at", cutoff) : null,
  ]);
  const visits = (inData ?? []) as unknown as Visit[];
  const arriving = (arrData ?? []) as unknown as Visit[];
  const expected = (expData ?? []) as unknown as Expected[];
  const inside = visits.reduce((n, v) => n + 1 + v.visit_guests.filter((g) => !g.checked_out_at).length, 0);
  const overstaying = visits.filter((v) => minutesSince(v.checked_in_at) >= OVERSTAY_HOURS * 60).length;
  const visitHit = (v: Visit) => hit(v.visitor_name, v.company, v.host?.full_name ?? "Reception", v.code, ...v.visit_guests.map((g) => g.full_name));
  const shownIn = visits.filter(visitHit);
  const shownArriving = arriving.filter(visitHit);
  const shownExpected = expected.filter((i) => hit(i.visitor_name, i.visitor_company, i.host?.full_name));

  const avatar = (v: Visit) => (
    <span className="grid size-[46px] shrink-0 place-items-center overflow-hidden rounded-[10px] bg-[#D9E4DE] font-display text-ink-2">
      {v.photo_path
        // eslint-disable-next-line @next/next/no-img-element -- private photo; the image optimiser must not cache it
        ? <img src={photoSrc(v.photo_path)} alt={`Photo of ${v.visitor_name}`} className="size-full object-cover" />
        : initials(v.visitor_name)}
    </span>
  );

  // Checked in but not yet approved by their host: they wait at reception. Visits for "Reception" need no approval.
  const shownWaiting = shownIn.filter((v) => v.host && v.host_response !== "coming");
  const shownInside = shownIn.filter((v) => !shownWaiting.includes(v));
  const row = (v: Visit) => {
    const stale = dayStart && new Date(v.checked_in_at) < new Date(dayStart);
    const open = v.visit_guests.filter((g) => !g.checked_out_at);
    const mins = minutesSince(v.checked_in_at);
    const unanswered = v.host && !v.host_response && mins >= REMIND_MINUTES;
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
              : unanswered
                ? <span className="font-semibold text-danger">No answer for {duration(mins)}</span>
                : mins >= OVERSTAY_HOURS * 60
                  ? <span className="inline-flex items-center gap-1 font-semibold text-[#B45309]" title={`In since ${clock(v.checked_in_at)}`}><Hourglass className="size-4" />Here {duration(mins)}</span>
                  : clock(v.checked_in_at)}
          </span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${v.source === "desk" ? "bg-tint text-brand" : "bg-warn-bg text-warn-ink"}`}>{SOURCE[v.source]}</span>
          {v.host && <HostReply visitId={v.id} response={v.host_response} mine={v.host_id === me.id} reception={isReception} />}
          {v.host && (v.host_email_error
            ? isReception
              ? <form action={resendHostEmail.bind(null, v.id)}>
                  <button title={v.host_email_error} className="btn-sm gap-1 text-danger"><MailWarning className="size-4" />Resend</button>
                </form>
              : <MailWarning className="size-4 text-danger" aria-label="Host email failed" />
            : v.host_email_sent_at && <MailCheck className="size-4 text-brand" aria-label="Host emailed" />)}
          {isReception && (
            <Link href={`/reception/visit/${v.id}/badge`} aria-label={`Print badge for ${v.visitor_name}`} title="Print badge"
              className="grid size-11 place-items-center rounded-[10px] text-ink-2 hover:bg-tint"><Printer className="size-[18px]" /></Link>
          )}
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
  };

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
        <Stat label="In the building" value={inside} note={overstaying ? `people · ${overstaying} over ${OVERSTAY_HOURS}h` : "people"} />
        <Stat label="Arriving" value={arriving.length} note="to confirm" />
        <Stat label="Expected today" value={expected.length} note="invites" />
        <Stat label="Signed out today" value={outToday ?? 0} note="visits" />
      </section>

      <LobbySearch q={q} placeholder={isReception ? "Search visitor, company, host or code" : "Search your visitors"} />

      {shownArriving.length > 0 && (
        <section className="overflow-hidden rounded-2xl border-[1.5px] border-warn bg-warn-bg/40">
          <h2 className="h-display border-b border-warn/30 px-4 py-3.5 text-[17px]">Arriving: check them, then confirm</h2>
          <ul>
            {shownArriving.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-3 border-b border-warn/20 px-4 py-3 last:border-b-0">
                {avatar(v)}
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[15px]">{v.visitor_name}{v.visit_guests.length > 0 && ` +${v.visit_guests.length}`}</b>
                  {v.watchlist && (
                    <span className="mt-0.5 inline-flex items-center gap-1 rounded-md bg-danger px-2 py-0.5 text-[12px] font-semibold text-white">
                      <ShieldAlert className="size-3.5" />Watchlist: {v.watchlist.reason}
                    </span>
                  )}
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

      {shownWaiting.length > 0 && (
        <section className="overflow-hidden rounded-2xl border-[1.5px] border-warn bg-surface">
          <h2 className="h-display border-b border-warn/30 px-4 py-3.5 text-[17px]">
            {isReception ? "Waiting for the host: keep them at reception" : "Waiting for your approval"}
          </h2>
          <ul>{shownWaiting.map(row)}</ul>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-[#E3EAE6] bg-surface">
        <h2 className="h-display border-b border-[#EEF2EF] px-4 py-3.5 text-[17px]">In the building</h2>
        {shownInside.length === 0 && (
          <p className="px-4 py-8 text-center text-muted">{q ? `No one here matches “${q}”.` : isReception ? "No one is checked in right now." : "None of your visitors are here right now."}</p>
        )}
        <ul>{shownInside.map(row)}</ul>
      </section>

      {shownExpected.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-[#E3EAE6] bg-surface">
          <h2 className="h-display border-b border-[#EEF2EF] px-4 py-3.5 text-[17px]">Expected today</h2>
          <ul>
            {shownExpected.map((i) => {
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
