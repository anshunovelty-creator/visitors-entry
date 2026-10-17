import { Suspense } from "react";
import { PackageCheck } from "lucide-react";
import { clock, day, daysAgo, getStaff } from "../staff";
import { LiveRefresh } from "../live";
import { collectDelivery } from "./actions";
import { LogDeliveryForm } from "./form";

type Delivery = {
  id: string; carrier: string | null; description: string | null; tracking: string | null;
  received_at: string; collected_at: string | null; recipient_id: string;
  recipient: { full_name: string } | null;
};
const FIELDS = "id, carrier, description, tracking, received_at, collected_at, recipient_id, recipient:staff!deliveries_recipient_id_fkey(full_name)";

export default function DeliveriesPage() {
  return (
    <main className="flex min-w-0 flex-1 flex-col gap-5 p-4 lg:px-8 lg:py-7">
      <h1 className="h-display text-[30px]">Deliveries</h1>
      <Suspense fallback={<p className="text-muted">Loading deliveries…</p>}>
        <Deliveries />
      </Suspense>
    </main>
  );
}

async function Deliveries() {
  const { supabase, me, isReception } = await getStaff();
  const weekAgo = daysAgo(7);
  // RLS: reception sees every parcel, everyone else their own.
  const [{ data: waitingData }, { data: doneData }, { data: staff }] = await Promise.all([
    supabase.from("deliveries").select(FIELDS).is("collected_at", null).order("received_at"),
    supabase.from("deliveries").select(FIELDS).not("collected_at", "is", null).gte("collected_at", weekAgo).order("collected_at", { ascending: false }).limit(50),
    isReception ? supabase.from("staff").select("id, full_name, department").eq("active", true).order("full_name") : { data: [] },
  ]);
  const waiting = (waitingData ?? []) as unknown as Delivery[];
  const done = (doneData ?? []) as unknown as Delivery[];
  const what = (d: Delivery) => [d.carrier, d.description].filter(Boolean).join(" · ") || "Parcel";
  const when = (iso: string) => `${day(iso)}, ${clock(iso)}`;

  return (
    <>
      <LiveRefresh tables={["deliveries"]} />
      {isReception && (
        <section className="overflow-hidden rounded-2xl border border-[#E3EAE6] bg-surface">
          <h2 className="h-display border-b border-[#EEF2EF] px-4 py-3.5 text-[17px]">A parcel arrived</h2>
          <LogDeliveryForm staff={staff ?? []} />
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-[#E3EAE6] bg-surface">
        <h2 className="h-display border-b border-[#EEF2EF] px-4 py-3.5 text-[17px]">Waiting at reception</h2>
        {waiting.length === 0 && <p className="px-4 py-8 text-center text-muted">{isReception ? "Nothing waiting to be collected." : "Nothing waiting for you."}</p>}
        <ul>
          {waiting.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 border-b border-[#F1F4F2] px-4 py-3 last:border-b-0">
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[15px]">{what(d)}</b>
                <span className="block truncate text-[13px] text-muted">
                  {[isReception && `for ${d.recipient?.full_name ?? "—"}`, `since ${when(d.received_at)}`, d.tracking && `#${d.tracking}`].filter(Boolean).join(" · ")}
                </span>
              </span>
              <form action={collectDelivery.bind(null, d.id)}>
                <button className="btn-sm bg-brand text-white">
                  <PackageCheck className="size-4" />{d.recipient_id === me.id ? "I've collected it" : "Handed over"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      {done.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-[#E3EAE6] bg-surface">
          <h2 className="h-display border-b border-[#EEF2EF] px-4 py-3.5 text-[17px]">Collected this week</h2>
          <ul>
            {done.map((d) => (
              <li key={d.id} className="border-b border-[#F1F4F2] px-4 py-2.5 text-[14px] last:border-b-0">
                <b className="font-semibold">{what(d)}</b>
                <span className="text-muted"> · {isReception && `${d.recipient?.full_name ?? "—"} · `}collected {when(d.collected_at!)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
