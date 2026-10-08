// What the desk camera read, as an invite code. Invite QRs hold the check-in link
// (…/visit?code=K7M2QX); a bare "K7M-2QX" works too. Anything else (the entrance poster,
// a random QR) is not an invite. Pure, so qr-code.test.ts can check it.
export function inviteCodeFromQr(text: string): string | null {
  let raw = String(text ?? "").trim();
  try {
    const url = new URL(raw);
    raw = url.searchParams.get("code") ?? "";
  } catch {
    // not a URL: treat it as a typed code
  }
  const code = raw.replace(/[\s-]/g, "").toUpperCase();
  return /^[A-HJ-KM-NP-Z2-9]{6}$/.test(code) ? code : null;
}
