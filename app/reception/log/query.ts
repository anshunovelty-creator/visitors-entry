import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LogFilters } from "./filters";

// The visit log's query, shared by the page and its CSV export. RLS scopes it: hosts get their own visits.
export async function logQuery(supabase: SupabaseClient, f: LogFilters, select: string, limit: number) {
  let query = supabase.from("visits").select(select).order("arrived_at", { ascending: false }).limit(limit);
  if (f.fromIso) query = query.gte("arrived_at", f.fromIso);
  if (f.toIso) query = query.lt("arrived_at", f.toIso);
  if (f.q) {
    // Host names live on staff, so look up matching hosts first and fold their ids into the or().
    const { data: hosts } = await supabase.from("staff").select("id").ilike("full_name", `%${f.q}%`).limit(50);
    const like = `*${f.q}*`;
    query = query.or([
      `visitor_name.ilike.${like}`,
      `company.ilike.${like}`,
      ...(hosts?.length ? [`host_id.in.(${hosts.map((h) => h.id).join(",")})`] : []),
    ].join(","));
  }
  return query;
}
