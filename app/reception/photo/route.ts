import { createClient } from "@/lib/supabase/server";

// Visitor photos at a stable URL the browser can keep, so lobby refreshes don't re-download every
// photo (signed URLs change on each render). Storage RLS decides access: reception sees all,
// hosts their own visitors'. A visit's photo never changes, so a day's private caching is safe.
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams.get("p") ?? "";
  if (!/^(desk|phone|staff)\/[0-9a-f-]{36}\.jpg$/.test(p)) return new Response(null, { status: 404 });
  const supabase = await createClient();
  const { data } = await supabase.storage.from("visit-photos").download(p);
  if (!data) return new Response(null, { status: 404 });
  return new Response(data, {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400, immutable" },
  });
}
