// One audit_log row as a sentence. Rows come from the database trigger (insert: the row; update:
// {column: [old, new]}; delete: the row) or the server (password_reset). Pure, so describe.test.ts can check it.

export type AuditRow = { entity: string; action: string; changes: Record<string, unknown> | null };

const STATUS: Record<string, string> = {
  arriving: "arriving", checked_in: "checked in", checked_out: "signed out", declined: "turned away", expired: "expired",
};
const SOURCE: Record<string, string> = { desk: "at the desk", own_phone: "on their phone", reception: "by reception" };

export function describe({ entity, action, changes }: AuditRow): string {
  const c = changes ?? {};
  const label = (c._label as string | null) ?? "someone";
  const diff = (k: string) => (Array.isArray(c[k]) ? (c[k] as unknown[]) : null);
  const from = (k: string) => diff(k)?.[0];
  const to = (k: string) => diff(k)?.[1];
  const status = (s: unknown) => STATUS[s as string] ?? String(s);

  switch (`${entity}:${action}`) {
    case "visits:INSERT":
      return c.status === "arriving" && c.source !== "own_phone"
        ? `${label} held for reception (watchlist) ${SOURCE[c.source as string] ?? ""}`.trim()
        : `${label} checked in ${SOURCE[c.source as string] ?? ""}`.trim();
    case "visits:UPDATE":
      if (diff("status")) return `${label}: ${status(from("status"))} → ${status(to("status"))}`;
      if (diff("host_response")) return `Host answered for ${label}: ${to("host_response") === "coming" ? "coming down" : "not available"}`;
      if (diff("photo_path") && to("photo_path") === null) return `Photo of ${label} deleted (90-day rule)`;
      if (diff("host_email_error") && to("host_email_error")) return `Host email about ${label} failed`;
      if (diff("host_email_sent_at")) return `Host emailed about ${label}`;
      break;
    case "visits:DELETE":
      return `Visit by ${label} deleted`;
    case "visit_guests:UPDATE":
      if (to("checked_out_at")) return `Guest ${label} signed out`;
      break;
    case "staff:INSERT":
      return `Added ${label} as ${c.role}`;
    case "staff:UPDATE":
      if (diff("active")) return to("active") ? `Reactivated ${label}` : `Deactivated ${label}`;
      if (diff("role")) return `${label}: ${from("role")} → ${to("role")}`;
      if (diff("must_change_password")) return to("must_change_password") ? `${label} must choose a new password` : `${label} changed their password`;
      if (diff("department")) return `${label}: department → ${to("department") ?? "none"}`;
      break;
    case "staff:password_reset":
      return `Reset the password for ${label}`;
    case "kiosk_devices:INSERT":
      return `Added desk device ${label}`;
    case "kiosk_devices:UPDATE":
      if (diff("revoked_at")) return to("revoked_at") ? `Revoked desk device ${label}` : `Re-enabled desk device ${label}`;
      break;
    case "invites:INSERT":
      return `Invited ${label} for ${c.visit_date}`;
    case "invites:UPDATE":
      if (to("status") === "cancelled") return `Cancelled the invite for ${label}`;
      if (to("status") === "used") return `${label} used their invite`;
      break;
    case "watchlist:INSERT":
      return `Added to the watchlist: ${[c.full_name, c.mobile].filter(Boolean).join(", ")} (${c.reason})`;
    case "watchlist:DELETE":
      return `Removed from the watchlist: ${[c.full_name, c.mobile].filter(Boolean).join(", ")}`;
    case "roll_calls:INSERT":
      return "Started an emergency roll call";
    case "roll_calls:UPDATE":
      if (to("ended_at")) return "Ended the roll call";
      break;
    case "roll_call_marks:INSERT":
      return "Marked a visitor safe";
    case "roll_call_marks:DELETE":
      return "Undid a safe mark";
  }
  const cols = Object.keys(c).filter((k) => k !== "_label");
  return `${entity.replace(/_/g, " ")} ${action.toLowerCase()}${cols.length ? `: ${cols.join(", ")}` : ""}`;
}
