"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Re-renders the page whenever a row in these tables changes. RLS decides which changes arrive.
// One check-in fires several changes (visit, each guest, email sent), so a burst becomes one refresh.
export function LiveRefresh({ tables = ["visits", "visit_guests"] }: { tables?: string[] }) {
  const router = useRouter();
  const key = tables.join(",");
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`live:${key}`);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => router.refresh(), 300); };
    for (const table of key.split(",")) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
    }
    channel.subscribe();
    return () => { clearTimeout(timer); supabase.removeChannel(channel); };
  }, [router, key]);
  return null;
}
