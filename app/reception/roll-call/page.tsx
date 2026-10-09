import { Suspense } from "react";
import { Check, Phone, Siren, Undo2 } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/server";
import { LiveRefresh } from "../live";
import { clock, getStaff, initials } from "../staff";
import { endRollCall, markSafe, startRollCall } from "./actions";
import { PrintButton } from "./print-button";

type Person = {
  person_id: string; visit_id: string; full_name: string; company: string | null; host: string; mobile: string | null;
  photo_path: string | null; is_guest: boolean; arrived_at: string; marked_at: string | null; marked_by: string | null;
};

export default function RollCallPage() {
  return (
    <main className="flex min-w-0 flex-1 flex-col gap-5 p-4 lg:px-8 lg:py-7">
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <RollCall />
      </Suspense>
    </main>
  );
}

async function RollCall() {
  const { supabase } = await getStaff();
  const { data: active } = await supabase.from("roll_calls")
    .select("id, started_at, starter:staff!roll_calls_started_by_fkey(full_name)").is("ended_at", null).maybeSingle();

  if (!active) {
    return (
      <>
        <LiveRefresh tables={["roll_calls"]} />
        <h1 className="h-display text-[30px]">Emergency roll call</h1>
        <p className="max-w-xl text-[15.5px] text-ink-2">
          In an evacuation, start a roll call. Everyone signed in as a visitor is listed with their photo and mobile,
          for every staff member, and marshals tick people off as safe from their own phones.
        </p>
        <form action={startRollCall}>
          <button className="btn bg-danger hover:bg-danger"><Siren className="size-5" /> Start roll call</button>
        </form>
      </>
    );
  }

  const { data } = await supabase.rpc("roll_call_people");
  const people = (data ?? []) as Person[];
  // Every staff member sees every visitor's photo during a roll call: the roll call function already
  // checked who's asking, so the service role signs the links here.
  const paths = people.flatMap((p) => (p.photo_path ? [p.photo_path] : []));
  const { data: signed } = paths.length
    ? await createAdminClient().storage.from("visit-photos").createSignedUrls(paths, 600)
    : { data: [] };
  const photo = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const missing = people.filter((p) => !p.marked_at);
  const safe = people.filter((p) => p.marked_at);
  const starter = (active.starter as unknown as { full_name: string } | null)?.full_name;

  const row = (p: Person) => (
    <li key={p.person_id} className="flex flex-wrap items-center gap-3 border-b border-[#F1F4F2] px-4 py-3 last:border-b-0 print:break-inside-avoid">
      <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-[#D9E4DE] font-display text-ink-2">
        {p.photo_path && photo.get(p.photo_path)
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL; must not be cached by the image optimiser
          ? <img src={photo.get(p.photo_path)!} alt={`Photo of ${p.full_name}`} className="size-full object-cover" />
          : initials(p.full_name)}
      </span>
      <span className="min-w-0 flex-1">
        <b className="block text-[16px]">{p.full_name}</b>
        <span className="block text-[13px] text-muted">
          {[p.is_guest ? "with a group" : p.company, `visiting ${p.host}`, `in since ${clock(p.arrived_at)}`].filter(Boolean).join(" · ")}
        </span>
        {p.marked_at && <span className="block text-[12.5px] font-medium text-brand">Safe · {p.marked_by ?? "staff"} · {clock(p.marked_at)}</span>}
      </span>
      {p.mobile && (
        <a href={`tel:${p.mobile}`} className="btn-sm border-[1.5px] border-line-input bg-surface print:border-0">
          <Phone className="size-4" /> {p.mobile}
        </a>
      )}
      <form action={markSafe.bind(null, active.id, p.person_id, !p.marked_at)} className="print:hidden">
        {p.marked_at
          ? <button className="btn-sm text-muted"><Undo2 className="size-4" /> Undo</button>
          : <button className="btn-sm min-w-28 bg-brand text-white"><Check className="size-4" /> Safe</button>}
      </form>
    </li>
  );

  return (
    <>
      <LiveRefresh tables={["roll_calls", "roll_call_marks", "visits", "visit_guests"]} />
      <header className="flex flex-wrap items-center gap-3 rounded-2xl bg-danger p-4 text-white">
        <Siren className="size-7" />
        <span className="min-w-0 flex-1">
          <h1 className="h-display text-[26px] leading-tight">Roll call in progress</h1>
          <span className="text-[13.5px] text-white/85">Started {clock(active.started_at)}{starter && ` by ${starter}`}</span>
        </span>
        <b className="font-display text-[34px] leading-none tabular-nums">{safe.length}/{people.length}</b>
        <span className="text-[13px] text-white/85">accounted for</span>
      </header>

      <div className="flex flex-wrap gap-2 print:hidden">
        <PrintButton />
        <form action={endRollCall.bind(null, active.id)}>
          <button className="btn-sm border-[1.5px] border-line-input bg-surface">End roll call</button>
        </form>
      </div>

      <section className="overflow-hidden rounded-2xl border-2 border-danger bg-surface">
        <h2 className="h-display border-b border-[#EEF2EF] px-4 py-3.5 text-[17px] text-danger">Not yet accounted for ({missing.length})</h2>
        {missing.length === 0 && <p className="px-4 py-6 text-center font-medium text-brand">Everyone is accounted for.</p>}
        <ul>{missing.map(row)}</ul>
      </section>

      {safe.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-[#E3EAE6] bg-surface">
          <h2 className="h-display border-b border-[#EEF2EF] px-4 py-3.5 text-[17px]">Safe ({safe.length})</h2>
          <ul>{safe.map(row)}</ul>
        </section>
      )}
      <p className="text-[13px] text-muted">Visitors only. Staff are accounted for by your own process.</p>
    </>
  );
}
