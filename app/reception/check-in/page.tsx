import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getStaff } from "../staff";
import { WalkInForm } from "./form";

export default function CheckInPage() {
  return (
    <main className="flex min-w-0 flex-1 flex-col gap-5 p-4 lg:px-8 lg:py-7">
      <h1 className="h-display text-[30px]">Check in a visitor</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <CheckIn />
      </Suspense>
    </main>
  );
}

async function CheckIn() {
  const { supabase, isReception } = await getStaff();
  if (!isReception) redirect("/reception");
  const { data: hosts } = await supabase.from("staff").select("id, full_name, department").eq("active", true).order("full_name");
  return (
    <section className="overflow-hidden rounded-2xl border border-[#E3EAE6] bg-surface">
      <h2 className="h-display border-b border-[#EEF2EF] px-4 py-3.5 text-[17px]">Walk-in, no invite</h2>
      <WalkInForm hosts={hosts ?? []} />
    </section>
  );
}
