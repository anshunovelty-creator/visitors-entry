import { createHmac, timingSafeEqual } from "node:crypto";

// Signs "this visit, this answer" for the host's email links, so they work without signing in.
// Pure (the secret is passed in), so sign.test.ts can check it.
export function sign(secret: string, visitId: string, response: string) {
  return createHmac("sha256", secret).update(`host-response:${visitId}:${response}`).digest("base64url");
}

export function verify(secret: string, visitId: string, response: string, signature: string) {
  const want = Buffer.from(sign(secret, visitId, response));
  const got = Buffer.from(String(signature ?? ""));
  return got.length === want.length && timingSafeEqual(got, want);
}
