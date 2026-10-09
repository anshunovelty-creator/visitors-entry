import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// The check-in screen promises "Deleted after 90 days". Vercel Cron calls this daily (vercel.json)
// with Authorization: Bearer $CRON_SECRET; nobody else can.
const KEEP_DAYS = 90;
const BATCH = 500;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const before = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString();
  let removed = 0;
  // ponytail: only photos attached to visits; an upload abandoned mid-check-in stays until someone
  // sweeps storage. Add a pass over storage.list() older than a day if those ever pile up.
  for (;;) {
    const { data: old, error } = await admin.from("visits").select("id, photo_path")
      .not("photo_path", "is", null).lt("arrived_at", before).limit(BATCH);
    if (error) return NextResponse.json({ error: error.message, removed }, { status: 500 });
    if (!old.length) break;
    const { error: e2 } = await admin.storage.from("visit-photos").remove(old.map((v) => v.photo_path!));
    if (e2) return NextResponse.json({ error: e2.message, removed }, { status: 500 });
    await admin.from("visits").update({ photo_path: null }).in("id", old.map((v) => v.id));
    removed += old.length;
    if (old.length < BATCH) break;
  }
  return NextResponse.json({ removed });
}
