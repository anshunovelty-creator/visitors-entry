import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// Just after office midnight (vercel.json), signs out everyone still checked in from an earlier day,
// so the lobby and roll call start clean. Called by Vercel Cron with Authorization: Bearer $CRON_SECRET.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data, error } = await createAdminClient().rpc("auto_sign_out");
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ signedOut: data });
}
