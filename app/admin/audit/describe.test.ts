// npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { describe } from "./describe.ts";

test("turns audit rows into sentences", () => {
  assert.equal(describe({ entity: "visits", action: "INSERT", changes: { _label: "Priya Sharma", status: "checked_in", source: "desk" } }),
    "Priya Sharma checked in at the desk");
  assert.equal(describe({ entity: "visits", action: "INSERT", changes: { _label: "M B", status: "arriving", source: "desk" } }),
    "M B held for reception (watchlist) at the desk");
  assert.equal(describe({ entity: "visits", action: "UPDATE", changes: { _label: "Priya", status: ["arriving", "checked_in"] } }),
    "Priya: arriving → checked in");
  assert.equal(describe({ entity: "visits", action: "UPDATE", changes: { _label: "Priya", host_response: [null, "coming"] } }),
    "Host answered for Priya: coming down");
  assert.equal(describe({ entity: "staff", action: "UPDATE", changes: { _label: "Rahul", active: [true, false] } }), "Deactivated Rahul");
  assert.equal(describe({ entity: "staff", action: "password_reset", changes: { _label: "Rahul" } }), "Reset the password for Rahul");
  assert.equal(describe({ entity: "kiosk_devices", action: "UPDATE", changes: { _label: "Front desk", revoked_at: [null, "2026-10-09T10:00:00Z"] } }),
    "Revoked desk device Front desk");
});

test("anything unrecognised still says what changed", () => {
  assert.equal(describe({ entity: "visits", action: "UPDATE", changes: { _label: "P", purpose: ["a", "b"] } }), "visits update: purpose");
  assert.equal(describe({ entity: "something_new", action: "DELETE", changes: null }), "something new delete");
});
