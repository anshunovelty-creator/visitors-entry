import { Suspense } from "react";
import Link from "next/link";
import { TriangleAlert, Users } from "lucide-react";
import { signOutVisit } from "./actions";
import { LiveRefresh } from "./live";
import { clock, day, getStaff, initials, SOURCE } from "./staff";

type Visit = {
  id: string;
  visitor_name: string;
  company: string | null;
  photo_path: string | null;
  source: "desk" | "own_phone" | "reception";
  checked_in_at: string;
  host: { full_name: string } | null;
  visit_guests: { id: string; full_name: string; checked_out_at: string | null }[];
};

export default function ReceptionPage() {
  return (
    <Suspense fallback={<p className="p-8 text-muted">Loading the lobby…</p>}>
      <Lobby />
    </Suspense>
  );
}

async function Lobby() {
  const { supabase, isReception } = await getStaff();

  const { data: dayStart } = await supabase.rpc("office_day_start");
  const [{ data }, { count: outToday }] = await Promise.all([
    supabase
      .from("visits")
      .select("id, visitor_name, company, photo_path, source, checked_in_at, host:staff!visits_host_id_fkey(full_name), visit_guests(id, full_name, checked_out_at)")
      .eq("status", "checked_in")
      .order("checked_in_at", { ascending: false }),
    supabase.from("visits").select("id", { count: "exact", head: true })
      .eq("status", "checked_out").gte("checked_out_at", dayStart),
  ]);
  const visits = (data ?? []) as unknown as Visit[];
  const inside = visits.reduce((n, v) => n + 1 + v.visit_guests.filter((g) => !g.checked_out_at).length, 0);

  const paths = visits.flatMap((v) => (v.photo_path ? [v.photo_path] : []));
  const { data: signed } = paths.length
    ? await supabase.storage.from("visit-photos").createSignedUrls(paths, 300)
    : { data: [] };
  const photo = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-5 p-4 lg:px-8 lg:py-7">
      <LiveRefresh />
      <header>
        <h1 className="h-display text-[30px]">{isReception ? "Lobby" : "My visitors"}</h1>
        <p className="mt-0.5 flex items-center gap-2 text-[13.5px] text-ink-2">
          <span className="size-2 rounded-full bg-[#16A34A] shadow-[0_0_0_4px_rgba(22,163,74,.15)]" /> Live
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3.5 lg:max-w-xl">
        <Stat label="In the building" value={inside} note="people" />
        <Stat label="Signed out today" value={outToday ?? 0} note="visits" />
      </section>

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
                    <span className="grid size-[46px] shrink-0 place-items-center overflow-hidden rounded-[10px] bg-[#D9E4DE] font-display text-ink-2">
                      {v.photo_path && photo.get(v.photo_path)
                        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL; must not be cached by the image optimiser
                        ? <img src={photo.get(v.photo_path)!} alt={`Photo of ${v.visitor_name}`} className="size-full object-cover" />
                        : initials(v.visitor_name)}
                    </span>
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
