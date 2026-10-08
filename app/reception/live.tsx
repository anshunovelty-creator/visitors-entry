"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Re-renders the lobby whenever a visit or guest row changes. RLS decides which changes arrive.
export function LiveRefresh() {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("lobby")
      .on("postgres_changes", { event: "*", schema: "public", table: "visits" }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "visit_guests" }, () => router.refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [router]);
  return null;
}
