// A one-day calendar entry (.ics) for an invite email: Google, Outlook and Apple Calendar all open it.
// Pure, so ics.test.ts can check it.

// Text values escape \ ; , and newlines; lines longer than 75 octets fold onto a leading space.
const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
function fold(line: string) {
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ""; }
    cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function inviteIcs(i: { uid: string; date: string; summary: string; description: string; location?: string; now?: Date }) {
  const day = i.date.replace(/-/g, "");
  const next = new Date(Date.parse(`${i.date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
  const stamp = (i.now ?? new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Novelty Labels//Visitors//EN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${i.uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${day}`,
    `DTEND;VALUE=DATE:${next}`,
    `SUMMARY:${esc(i.summary)}`,
    `DESCRIPTION:${esc(i.description)}`,
    ...(i.location ? [`LOCATION:${esc(i.location)}`] : []),
    "TRANSP:TRANSPARENT",
    "END:VEVENT", "END:VCALENDAR",
  ].map(fold).join("\r\n") + "\r\n";
}
