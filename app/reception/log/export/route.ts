import type { NextRequest } from "next/server";
import { getStaff, officeToday } from "../../staff";
import { parseLogFilters } from "../filters";
import { logQuery } from "../query";

const EXPORT_LIMIT = 10_000;

type Row = {
  visitor_name: string; company: string | null; mobile: string | null; purpose: string | null; source: string;
  status: string; auto_signed_out: boolean; arrived_at: string; checked_in_at: string | null; checked_out_at: string | null;
  host_response: "coming" | "unavailable" | null; vehicle_no: string | null; carrying: string | null; agreed_at: string | null; host: { full_name: string } | null; visit_guests: { full_name: string }[];
};

// Office time (India, +05:30), as "2026-10-16 14:05".
const at = (iso: string | null) => (iso ? new Date(Date.parse(iso) + 330 * 60_000).toISOString().slice(0, 16).replace("T", " ") : "");
// Every cell quoted; a leading = + - @ (or tab/CR) gets a ' so a visitor's "name" can't run as a
// spreadsheet formula when someone opens the file.
const cell = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;

// The visit log as CSV, with the log page's filters. RLS scopes it like the page.
export async function GET(request: NextRequest) {
  const { supabase } = await getStaff();
  const f = parseLogFilters(Object.fromEntries(request.nextUrl.searchParams));
  const { data, error } = await logQuery(supabase, f,
    "visitor_name, company, mobile, purpose, source, status, auto_signed_out, arrived_at, checked_in_at, checked_out_at, host_response, vehicle_no, carrying, agreed_at, host:staff!visits_host_id_fkey(full_name), visit_guests(full_name)",
    EXPORT_LIMIT);
  if (error) return new Response("Could not load visits.", { status: 500 });
  const rows = (data ?? []) as unknown as Row[];
  const lines = [
    ["Arrived", "Visitor", "Company", "Mobile", "Purpose", "Visiting", "With them", "Checked in by", "Status", "Host answer", "Checked in", "Checked out", "Vehicle", "Carrying", "Agreement accepted"],
    ...rows.map((v) => [
      at(v.arrived_at), v.visitor_name, v.company ?? "", v.mobile ?? "", v.purpose ?? "", v.host?.full_name ?? "Reception",
      v.visit_guests.map((g) => g.full_name).join("; "), v.source,
      v.auto_signed_out ? "not signed out" : v.status.replace("_", " "),
      v.host_response === "coming" ? "approved" : v.host_response === "unavailable" ? "declined" : "",
      at(v.checked_in_at), v.auto_signed_out ? "" : at(v.checked_out_at),
      v.vehicle_no ?? "", v.carrying ?? "", at(v.agreed_at),
    ]),
  ];
  // The BOM makes Excel read names in any script correctly.
  const csv = "﻿" + lines.map((l) => l.map(cell).join(",")).join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="visits-${f.from || "start"}-to-${f.to || officeToday()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
