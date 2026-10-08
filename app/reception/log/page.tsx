import { Suspense } from "react";
import Link from "next/link";
import { Search, Users } from "lucide-react";
import { clock, day, getStaff, SOURCE } from "../staff";
import { parseLogFilters } from "./filters";

type Row = {
  id: string;
  visitor_name: string;
  company: string | null;
  source: keyof typeof SOURCE;
  status: string;
  arrived_at: string;
  checked_out_at: string | null;
  host: { full_name: string } | null;
  visit_guests: { count: number }[];
};

// ponytail: newest 200, no paging. Add "load more" once a date range regularly holds more.
const LIMIT = 200;

export default function LogPage({ searchParams }: PageProps<"/reception/log">) {
  return (
    <main className="flex min-w-0 flex-1 flex-col gap-5 p-4 lg:px-8 lg:py-7">
      <h1 className="h-display text-[30px]">Visit log</h1>
      <Suspense fallback={<p className="text-muted">Loading visits…</p>}>
        <Log searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Log({ searchParams }: { searchParams: PageProps<"/reception/log">["searchParams"] }) {
  const { supabase, isReception } = await getStaff();
  const f = parseLogFilters(await searchParams);

  let query = supabase
    .from("visits")
    .select("id, visitor_name, company, source, status, arrived_at, checked_out_at, host:staff!visits_host_id_fkey(full_name), visit_guests(count)")
    .order("arrived_at", { ascending: false })
    .limit(LIMIT);
  if (f.fromIso) query = query.gte("arrived_at", f.fromIso);
  if (f.toIso) query = query.lt("arrived_at", f.toIso);
  if (f.q) {
    // Host names live on staff, so look up matching hosts first and fold their ids into the or().
    const { data: hosts } = await supabase.from("staff").select("id").ilike("full_name", `%${f.q}%`).limit(50);
    const like = `*${f.q}*`;
    query = query.or([
      `visitor_name.ilike.${like}`,
      `company.ilike.${like}`,
      ...(hosts?.length ? [`host_id.in.(${hosts.map((h) => h.id).join(",")})`] : []),
    ].join(","));
  }
  const { data, error } = await query;
  const rows = (data ?? []) as unknown as Row[];

  return (
    <>
      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-[#E3EAE6] bg-surface p-4">
        <label className="min-w-56 flex-[2]">
          <span className="label">Search</span>
          <span className="relative block">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted" />
            <input name="q" defaultValue={f.q} className="input pl-11" placeholder={isReception ? "Visitor, company or host" : "Visitor or company"} />
          </span>
        </label>
        <label className="min-w-36 flex-1"><span className="label">From</span><input name="from" type="date" defaultValue={f.from} className="input" /></label>
        <label className="min-w-36 flex-1"><span className="label">To</span><input name="to" type="date" defaultValue={f.to} className="input" /></label>
        <button className="btn h-[52px]">Search</button>
        {(f.q || f.from || f.to) && <Link href="/reception/log" className="flex h-[52px] items-center px-2 text-[14px] font-semibold text-brand">Clear</Link>}
      </form>

      <section className="overflow-hidden rounded-2xl border border-[#E3EAE6] bg-surface">
        <p className="border-b border-[#EEF2EF] px-4 py-3 text-[13.5px] text-ink-2" role="status">
          {error ? "Could not load visits. Refresh to try again."
            : rows.length === LIMIT ? `Showing the newest ${LIMIT}. Narrow the dates to see older visits.`
            : `${rows.length} ${rows.length === 1 ? "visit" : "visits"}`}
        </p>
        {rows.length === 0 && !error && <p className="px-4 py-8 text-center text-muted">No visits match.</p>}
        <ul>
          {rows.map((v) => {
            const guests = v.visit_guests[0]?.count ?? 0;
            return (
              <li key={v.id} className="border-b border-[#F1F4F2] last:border-b-0">
                <Link href={`/reception/visit/${v.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-tint/60">
                  <span className="w-28 shrink-0 text-[13.5px] tabular-nums">
                    <b className="block">{day(v.arrived_at)}</b>
                    <span className="text-muted">{clock(v.arrived_at)}{v.checked_out_at && ` – ${clock(v.checked_out_at)}`}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[15px]">
                      {v.visitor_name}
                      {guests > 0 && <span className="ml-1.5 inline-flex items-center gap-0.5 align-middle text-[12px] font-semibold text-muted"><Users className="size-3.5" />+{guests}</span>}
                    </b>
                    <span className="block truncate text-[13px] text-muted">
                      {[v.company, `visiting ${v.host?.full_name ?? "Reception"}`].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="text-[12.5px] text-muted">{SOURCE[v.source]}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${v.status === "checked_in" ? "bg-tint text-brand" : "bg-[#EEF2EF] text-ink-2"}`}>
                    {v.status === "checked_in" ? "Inside" : v.status === "checked_out" ? "Left" : v.status}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
