import { test } from "node:test";
import assert from "node:assert/strict";
import { inviteIcs } from "./ics.ts";

test("invite calendar entry", () => {
  const ics = inviteIcs({
    uid: "abc@visitors", date: "2026-12-31", summary: "Visit; Novelty, Labels", now: new Date("2026-10-17T05:06:07.123Z"),
    description: "Code K7M-2QX\nhttps://example.test/visit?code=K7M2QX " + "x".repeat(80),
  });
  const lines = ics.split("\r\n");
  assert.ok(lines.includes("DTSTART;VALUE=DATE:20261231"));
  assert.ok(lines.includes("DTEND;VALUE=DATE:20270101"), "ends the next day, across a year end");
  assert.ok(lines.includes("DTSTAMP:20261017T050607Z"));
  assert.ok(lines.includes("SUMMARY:Visit\; Novelty\\, Labels"), "escapes ; and ,");
  assert.ok(ics.includes("Code K7M-2QX\\nhttps://"), "newlines become \\n");
  assert.ok(lines.every((l) => new TextEncoder().encode(l).length <= 75), "long lines fold");
  assert.ok(lines.some((l) => l.startsWith(" ")), "folded lines start with a space");
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
});
