"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Re-renders the page whenever a row in these tables changes. RLS decides which changes arrive.
export function LiveRefresh({ tables = ["visits", "visit_guests"] }: { tables?: string[] }) {
  const router = useRouter();
  const key = tables.join(",");
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`live:${key}`);
    for (const table of key.split(",")) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => router.refresh());
    }
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [router, key]);
  return null;
}
