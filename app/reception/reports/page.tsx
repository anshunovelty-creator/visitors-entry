import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { duration, getStaff, officeToday } from "../staff";
import { parseLogFilters } from "../log/filters";
import { summarize, type Bar, type ReportVisit } from "./stats";

const REPORT_LIMIT = 10_000;
const DEFAULT_DAYS = 30;

export default function ReportsPage({ searchParams }: PageProps<"/reception/reports">) {
  return (
    <main className="flex min-w-0 flex-1 flex-col gap-5 p-4 lg:px-8 lg:py-7">
      <h1 className="h-display text-[30px]">Reports</h1>
      <Suspense fallback={<p className="text-muted">Working out the numbers…</p>}>
        <Report searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Report({ searchParams }: { searchParams: PageProps<"/reception/reports">["searchParams"] }) {
  const { supabase, isReception } = await getStaff();
  if (!isReception) redirect("/reception");
  const today = officeToday();
  const f = parseLogFilters(await searchParams); // only its validated from / to are used
  const from = f.from || new Date(Date.parse(`${today}T00:00:00Z`) - (DEFAULT_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
  const to = f.to && f.to >= from ? f.to : today;

  const { data, error } = await supabase.from("visits")
    .select("status, checked_in_at, checked_out_at, auto_signed_out, company, host_response, host_responded_at, host:staff!visits_host_id_fkey(full_name), visit_guests(count)")
    .gte("arrived_at", `${from}T00:00:00+05:30`)
    .lt("arrived_at", new Date(Date.parse(`${to}T00:00:00+05:30`) + 86_400_000).toISOString())
    .limit(REPORT_LIMIT);
  const visits = ((data ?? []) as unknown as (Omit<ReportVisit, "guests"> & { visit_guests: { count: number }[] })[])
    .map((v) => ({ ...v, guests: v.visit_guests[0]?.count ?? 0 }));
  const s = summarize(visits, from, to);
  const answered = s.approved + s.declined;
  const short = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
  const hour = (h: string) => `${+h % 12 || 12}${+h < 12 ? "am" : "pm"}`;
  const range = new URLSearchParams({ from, to });

  return (
    <>
      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-[#E3EAE6] bg-surface p-4">
        <label className="min-w-36 flex-1"><span className="label">From</span><input name="from" type="date" defaultValue={from} max={today} className="input" /></label>
        <label className="min-w-36 flex-1"><span className="label">To</span><input name="to" type="date" defaultValue={to} max={today} className="input" /></label>
        <button className="btn h-[52px]">Show</button>
        <a href={`/reception/log/export?${range}`} className="flex h-[52px] items-center gap-1.5 px-2 text-[14px] font-semibold text-brand">
          <Download className="size-4" />Export CSV
        </a>
      </form>

      {error && <p role="alert" className="text-danger">Could not load visits. Refresh to try again.</p>}
      {visits.length === REPORT_LIMIT && <p className="text-[13.5px] text-ink-2">Only the first {REPORT_LIMIT.toLocaleString("en-IN")} visits are counted. Pick a shorter range.</p>}

      <section className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Tile label="Visits" value={s.visits.toLocaleString("en-IN")} note={`${s.people.toLocaleString("en-IN")} people with guests`} />
        <Tile label="Typical visit" value={s.typicalStay === null ? "—" : duration(Math.round(s.typicalStay))} note="check-in to sign-out (median)" />
        <Tile label="Host approval" value={answered ? `${Math.round((s.approved / answered) * 100)}%` : "—"}
          note={s.typicalAnswer === null ? "no answers yet" : `answered in ${duration(Math.round(s.typicalAnswer))} (median)`} />
        <Tile label="Not admitted" value={s.notAdmitted.toLocaleString("en-IN")} note="turned away or never confirmed" />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Visits per day" sub={`${short(from)} – ${short(to)}`}>
          <Bars data={s.perDay} label={(b) => short(b.key)} unit="visits" />
        </Panel>
        <Panel title="Busiest hours" sub="by check-in time">
          {s.perHour.length ? <Bars data={s.perHour} label={(b) => hour(b.key)} unit="visits" /> : <Empty />}
        </Panel>
        <Panel title="Most visited" sub="hosts">
          <Ranking rows={s.topHosts} />
        </Panel>
        <Panel title="Top companies" sub="visitors from">
          <Ranking rows={s.topCompanies} />
        </Panel>
      </div>
      <p className="text-[13px] text-muted">Every visit in this range is in the <Link href={`/reception/log?${range}`} className="font-semibold text-brand">visit log</Link>.</p>
    </>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-[14px] border border-[#E3EAE6] bg-surface px-4.5 py-4">
      <span className="text-[13px] font-medium text-ink-2">{label}</span>
      <b className="mt-1 block font-display text-[34px] leading-none font-semibold tabular-nums">{value}</b>
      <span className="text-[12.5px] text-muted">{note}</span>
    </div>
  );
}

function Panel({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl border border-[#E3EAE6] bg-surface p-4">
      <h2 className="h-display text-[17px]">{title} <span className="font-sans text-[13px] font-normal text-muted">{sub}</span></h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

const Empty = () => <p className="py-8 text-center text-muted">No visits in this range.</p>;

// One series, so no legend: the panel title names it. Bars ≤ 24px with a 4px rounded top, a 2px gap,
// hairline gridlines; hover or focus a bar for its value. Only some x labels, so they never collide.
function Bars({ data, label, unit }: { data: Bar[]; label: (b: Bar) => string; unit: string }) {
  const max = Math.max(...data.map((d) => d.value));
  if (!max) return <Empty />;
  const top = max <= 4 ? max : Math.ceil(max / 4) * 4; // so the half-way gridline is a whole number
  const every = Math.ceil(data.length / 8);
  return (
    <figure>
      <div className="flex gap-2">
        <div className="flex h-40 w-6 flex-col justify-between text-right text-[11.5px] text-muted tabular-nums" aria-hidden>
          <span className="-translate-y-1/2">{top}</span>
          <span>{top % 2 ? "" : top / 2}</span>
          <span className="translate-y-1/2">0</span>
        </div>
        <div className="relative flex h-40 flex-1 items-end gap-[2px] border-b border-[#D5DED9]" role="list" aria-label={`${unit} chart`}>
          <span className="pointer-events-none absolute inset-x-0 top-0 border-t border-[#EEF2EF]" />
          <span className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-[#EEF2EF]" />
          {data.map((d) => (
            <div key={d.key} role="listitem" tabIndex={0} aria-label={`${label(d)}: ${d.value} ${unit}`}
              className="group relative flex h-full min-w-0 flex-1 items-end justify-center outline-none">
              <div className="relative w-full max-w-6 rounded-t-[4px] bg-brand group-hover:bg-brand-hover group-focus-visible:bg-brand-hover" style={{ height: `${(d.value / top) * 100}%` }}>
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 rounded-md bg-ink px-2 py-1 text-xs whitespace-nowrap text-white group-hover:block group-focus-visible:block">
                  {label(d)}: <b>{d.value}</b>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1.5 ml-8 flex gap-[2px] text-[11.5px] text-muted" aria-hidden>
        {data.map((d, i) => <span key={d.key} className="min-w-0 flex-1 text-center whitespace-nowrap">{i % every === 0 ? label(d) : ""}</span>)}
      </div>
    </figure>
  );
}

function Ranking({ rows }: { rows: Bar[] }) {
  if (!rows.length) return <Empty />;
  const max = rows[0].value;
  return (
    <table className="w-full text-[14px]">
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-b border-[#F1F4F2] last:border-b-0">
            <td className="max-w-0 truncate py-2 pr-3" title={r.key}>{r.key}</td>
            <td className="w-2/5 py-2"><span className="block h-2 rounded-r-[4px] bg-tint"><span className="block h-2 rounded-r-[4px] bg-brand" style={{ width: `${(r.value / max) * 100}%` }} /></span></td>
            <td className="w-12 py-2 pl-3 text-right font-semibold tabular-nums">{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
