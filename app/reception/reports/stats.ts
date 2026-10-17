// Turns a date range's visits into the report's numbers. Pure, so stats.test.ts can check it.
// ponytail: aggregated in JS over at most REPORT_LIMIT rows; move to a SQL group-by view if a range
// regularly holds more.

export type ReportVisit = {
  status: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
  auto_signed_out: boolean;
  company: string | null;
  host_response: "coming" | "unavailable" | null;
  host_responded_at: string | null;
  host: { full_name: string } | null;
  guests: number;
};

export type Bar = { key: string; value: number };

// Office time is India (+05:30, no daylight saving), so a fixed shift gives the office date and hour.
const office = (iso: string) => new Date(Date.parse(iso) + 330 * 60_000);
const minutes = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 60_000;

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function top(names: (string | null)[], n = 8): Bar[] {
  const counts = new Map<string, { key: string; value: number }>();
  for (const raw of names) {
    const name = raw?.trim();
    if (!name) continue;
    const c = counts.get(name.toLowerCase()) ?? { key: name, value: 0 };
    c.value++;
    counts.set(name.toLowerCase(), c);
  }
  return [...counts.values()].sort((a, b) => b.value - a.value || a.key.localeCompare(b.key)).slice(0, n);
}

// fromDay / toDay: office dates (YYYY-MM-DD), both included.
export function summarize(visits: ReportVisit[], fromDay: string, toDay: string) {
  const admitted = visits.filter((v) => v.checked_in_at && (v.status === "checked_in" || v.status === "checked_out"));
  const stays = admitted
    .filter((v) => v.checked_out_at && !v.auto_signed_out)
    .map((v) => minutes(v.checked_in_at!, v.checked_out_at!));
  const answered = admitted.filter((v) => v.host && v.host_response && v.host_responded_at);

  const perDay = new Map<string, number>();
  for (let t = Date.parse(`${fromDay}T00:00:00Z`), end = Date.parse(`${toDay}T00:00:00Z`); t <= end; t += 86_400_000) {
    perDay.set(new Date(t).toISOString().slice(0, 10), 0);
  }
  const perHour = new Array<number>(24).fill(0);
  for (const v of admitted) {
    const d = office(v.checked_in_at!);
    const day = d.toISOString().slice(0, 10);
    if (perDay.has(day)) perDay.set(day, perDay.get(day)! + 1);
    perHour[d.getUTCHours()]++;
  }
  // Busiest hours: just the span that had visitors, so the chart isn't mostly empty night.
  const used = perHour.flatMap((n, h) => (n ? [h] : []));
  const hours = used.length ? perHour.slice(used[0], used.at(-1)! + 1).map((value, i) => ({ key: String(used[0] + i), value })) : [];

  return {
    visits: admitted.length,
    people: admitted.reduce((n, v) => n + 1 + v.guests, 0),
    notAdmitted: visits.filter((v) => v.status === "declined" || v.status === "expired").length,
    typicalStay: median(stays),
    approved: answered.filter((v) => v.host_response === "coming").length,
    declined: answered.filter((v) => v.host_response === "unavailable").length,
    // Answered while still Arriving counts as instant.
    typicalAnswer: median(answered.map((v) => Math.max(0, minutes(v.checked_in_at!, v.host_responded_at!)))),
    perDay: [...perDay].map(([key, value]) => ({ key, value })),
    perHour: hours,
    topHosts: top(admitted.map((v) => v.host?.full_name ?? "Reception")),
    topCompanies: top(admitted.map((v) => v.company)),
  };
}
