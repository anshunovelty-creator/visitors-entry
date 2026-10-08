import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { KioskFlow } from "./kiosk-flow";

export default function KioskPage() {
  return (
    <Suspense>
      <Kiosk />
    </Suspense>
  );
}

async function Kiosk() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("kiosk_whoami").maybeSingle();
  if (error || !data) redirect("/kiosk/enroll");
  return <KioskFlow />;
}
