// npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import jsQR from "jsqr";
import QRCode from "qrcode";
import { inviteCodeFromQr } from "./qr-code.ts";

test("reads the code out of an invite QR", () => {
  assert.equal(inviteCodeFromQr("https://visitors-entry.vercel.app/visit?code=K7M2QX"), "K7M2QX");
  assert.equal(inviteCodeFromQr("  k7m-2qx "), "K7M2QX");
});

test("the scanner's decoder reads the QR the invite email carries", () => {
  // Same generator and settings as the invite email, rendered to pixels at 4px per module.
  const { modules } = QRCode.create("https://visitors-entry.vercel.app/visit?code=K7M2QX", { errorCorrectionLevel: "M" });
  const px = 4, quiet = 4, side = (modules.size + quiet * 2) * px;
  const rgba = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let y = 0; y < modules.size; y++) for (let x = 0; x < modules.size; x++) {
    if (!modules.get(x, y)) continue;
    for (let dy = 0; dy < px; dy++) for (let dx = 0; dx < px; dx++) {
      const i = (((y + quiet) * px + dy) * side + (x + quiet) * px + dx) * 4;
      rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
    }
  }
  const hit = jsQR(rgba, side, side, { inversionAttempts: "dontInvert" });
  assert.equal(inviteCodeFromQr(hit?.data ?? ""), "K7M2QX");
});

test("ignores QRs that aren't invites", () => {
  assert.equal(inviteCodeFromQr("https://visitors-entry.vercel.app/visit"), null, "the entrance poster");
  assert.equal(inviteCodeFromQr("https://example.com/?code=hello!"), null);
  assert.equal(inviteCodeFromQr("K7M2Q0"), null, "0 isn't in the code alphabet");
  assert.equal(inviteCodeFromQr("WIFI:S:office;T:WPA;P:secret;;"), null);
});
