// npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseLogFilters } from "./filters.ts";

test("strips PostgREST filter syntax from the search", () => {
  assert.equal(parseLogFilters({ q: "  Priya),host_id.eq.x*  " }).q, "Priyahostid.eq.x");
  assert.equal(parseLogFilters({ q: "O'Brien  Ltd." }).q, "O'Brien Ltd.");
  assert.equal(parseLogFilters({ q: "प्रिया" }).q, "प्रिया");
});

test("dates are whole office days in IST, 'to' inclusive", () => {
  const f = parseLogFilters({ from: "2026-10-08", to: "2026-10-08" });
  assert.equal(f.fromIso, "2026-10-07T18:30:00.000Z");
  assert.equal(f.toIso, "2026-10-08T18:30:00.000Z");
});

test("ignores malformed or impossible dates", () => {
  const f = parseLogFilters({ from: "08/10/2026", to: "2026-13-45" });
  assert.deepEqual([f.from, f.to, f.fromIso, f.toIso], ["", "", null, null]);
  assert.equal(parseLogFilters({ q: ["a", "b"] }).q, "a");
});
