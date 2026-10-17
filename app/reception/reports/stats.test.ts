import { test } from "node:test";
import assert from "node:assert/strict";
import { median, summarize, type ReportVisit } from "./stats.ts";

const v = (o: Partial<ReportVisit>): ReportVisit => ({
  status: "checked_out", checked_in_at: null, checked_out_at: null, auto_signed_out: false, company: null,
  host_response: null, host_responded_at: null, host: null, guests: 0, ...o,
});

test("median", () => {
  assert.equal(median([]), null);
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});

test("summarize", () => {
  const s = summarize([
    // 10:00 IST on 1 Oct, 30 min stay, host approved after 4 min, 2 guests
    v({ checked_in_at: "2026-10-01T04:30:00Z", checked_out_at: "2026-10-01T05:00:00Z", company: "Acme",
        host: { full_name: "Rahul" }, host_response: "coming", host_responded_at: "2026-10-01T04:34:00Z", guests: 2 }),
    // 23:50 IST on 2 Oct (18:20 UTC), closed overnight: no stay time; still inside counts
    v({ checked_in_at: "2026-10-02T18:20:00Z", checked_out_at: "2026-10-02T18:40:00Z", auto_signed_out: true, company: " acme " }),
    v({ status: "checked_in", checked_in_at: "2026-10-02T05:00:00Z", host: { full_name: "Rahul" }, host_response: "unavailable", host_responded_at: "2026-10-02T05:10:00Z" }),
    v({ status: "declined" }), v({ status: "expired" }),
  ], "2026-10-01", "2026-10-03");
  assert.equal(s.visits, 3);
  assert.equal(s.people, 5);
  assert.equal(s.notAdmitted, 2);
  assert.equal(s.typicalStay, 30, "auto sign-outs don't count as a stay");
  assert.deepEqual([s.approved, s.declined, s.typicalAnswer], [1, 1, 7]);
  assert.deepEqual(s.perDay, [{ key: "2026-10-01", value: 1 }, { key: "2026-10-02", value: 2 }, { key: "2026-10-03", value: 0 }]);
  assert.deepEqual(s.perHour.map((h) => h.key), ["10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23"]);
  assert.deepEqual(s.topHosts[0], { key: "Rahul", value: 2 });
  assert.deepEqual(s.topCompanies, [{ key: "Acme", value: 2 }], "companies match ignoring case and spaces");
});
