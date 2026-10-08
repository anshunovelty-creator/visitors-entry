// Turns the visit log's query string into safe filter values. Pure, so filters.test.ts can check it.

export type LogFilters = { q: string; from: string; to: string; fromIso: string | null; toIso: string | null };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
// Office time zone (Asia/Kolkata, no DST), matching office_day_start() in the migration.
const OFFICE_OFFSET = "+05:30";

export function parseLogFilters(sp: Record<string, string | string[] | undefined>): LogFilters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? "";
  // Letters (with combining marks, for Indic scripts), digits, spaces and . ' @ - only:
  // PostgREST's or() filter treats , ( ) * as syntax.
  const q = one("q").replace(/[^\p{L}\p{M}\p{N} .'@-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 60);
  const from = DATE.test(one("from")) ? one("from") : "";
  const to = DATE.test(one("to")) ? one("to") : "";
  const start = (d: string) => new Date(`${d}T00:00:00${OFFICE_OFFSET}`);
  const valid = (d: Date) => !Number.isNaN(d.getTime());
  const fromDate = from ? start(from) : null;
  // "to" is inclusive: everything before the start of the next office day.
  const toDate = to ? new Date(start(to).getTime() + 86_400_000) : null;
  return {
    q,
    from: fromDate && valid(fromDate) ? from : "",
    to: toDate && valid(toDate) ? to : "",
    fromIso: fromDate && valid(fromDate) ? fromDate.toISOString() : null,
    toIso: toDate && valid(toDate) ? toDate.toISOString() : null,
  };
}
