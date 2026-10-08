// npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { sign, verify } from "./sign.ts";

const id = "0b6c1f3e-8a2b-4c3d-9e4f-5a6b7c8d9e0f";

test("a link only answers for its own visit and its own answer", () => {
  const s = sign("secret", id, "coming");
  assert.equal(verify("secret", id, "coming", s), true);
  assert.equal(verify("secret", id, "unavailable", s), false, "can't flip the answer");
  assert.equal(verify("secret", id.replace("0b", "0c"), "coming", s), false, "can't reuse on another visit");
  assert.equal(verify("other", id, "coming", s), false, "needs the server's secret");
  assert.equal(verify("secret", id, "coming", ""), false);
  assert.equal(verify("secret", id, "coming", s.slice(1)), false);
});
