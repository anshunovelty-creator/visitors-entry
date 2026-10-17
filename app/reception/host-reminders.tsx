"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { remindHosts } from "./actions";

// Reception screens only: once a minute, remind hosts who haven't answered (see remindHosts).
// Only the lobby is re-rendered, to keep its "No answer for …" and overstay times current; other
// pages (reports, log) would redo their queries for nothing.
export function HostReminders() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(async () => {
      await remindHosts().catch(() => {});
      if (location.pathname === "/reception" && document.visibilityState === "visible") router.refresh();
    }, 60_000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}
