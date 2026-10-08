import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Phone } from "lucide-react";
import { signOutVisit } from "../../actions";
import { clock, day, getStaff, initials, SOURCE } from "../../staff";

type Visit = {
  id: string;
  visitor_name: string;
  company: string | null;
  mobile: string | null;
  purpose: string | null;
  photo_path: string | null;
  source: keyof typeof SOURCE;
  status: string;
  arrived_at: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
  host: { full_name: string; department: string | null } | null;
  visit_guests: { id: string; full_name: string; checked_out_at: string | null }[];
};

const STATUS: Record<string, string> = { checked_in: "Inside", checked_out: "Left", arriving: "Arriving", declined: "Declined", expired: "Expired" };

export default function VisitPage({ params }: PageProps<"/reception/visit/[id]">) {
  return (
    <Suspense fallback={<p className="p-8 text-muted">Loading…</p>}>
      <Detail params={params} />
    </Suspense>
  );
}

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, isReception } = await getStaff();
  // RLS hides other hosts' visitors, so a host opening someone else's link gets a 404.
  const { data } = await supabase
    .from("visits")
    .select("id, visitor_name, company, mobile, purpose, photo_path, source, status, arrived_at, checked_in_at, checked_out_at, host:staff!visits_host_id_fkey(full_name, department), visit_guests(id, full_name, checked_out_at)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const v = data as unknown as Visit;
  const { data: signed } = v.photo_path
    ? await supabase.storage.from("visit-photos").createSignedUrl(v.photo_path, 300)
    : { data: null };
  const inside = v.status === "checked_in";
  const at = (iso: string | null) => (iso ? `${day(iso)}, ${clock(iso)}` : "—");

  return (
    <main className="flex w-full max-w-3xl flex-col gap-5 p-4 lg:px-8 lg:py-7">
      <Link href="/reception" className="-ml-2 flex min-h-11 w-fit items-center gap-0.5 px-2 text-[14px] font-medium text-ink-2">
        <ChevronLeft className="size-4" /> Back
      </Link>

      <section className="flex flex-col gap-5 rounded-2xl border border-[#E3EAE6] bg-surface p-5 sm:flex-row">
        <span className="grid aspect-square w-full max-w-[220px] shrink-0 place-items-center overflow-hidden rounded-2xl bg-[#D9E4DE] font-display text-5xl text-ink-2">
          {signed?.signedUrl
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL; must not be cached by the image optimiser
            ? <img src={signed.signedUrl} alt={`Photo of ${v.visitor_name}`} className="size-full object-cover" />
            : initials(v.visitor_name)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${inside ? "bg-tint text-brand" : "bg-[#EEF2EF] text-ink-2"}`}>
              {STATUS[v.status] ?? v.status}
            </span>
            <h1 className="h-display mt-2 text-[30px] break-words">{v.visitor_name}</h1>
            {v.company && <p className="text-[15px] text-ink-2">{v.company}</p>}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-[14.5px]">
            <dt className="text-muted">Mobile</dt>
            <dd>{v.mobile
              ? <a href={`tel:${v.mobile}`} className="inline-flex items-center gap-1.5 font-medium text-brand"><Phone className="size-4" />{v.mobile}</a>
              : "—"}</dd>
            <dt className="text-muted">Visiting</dt>
            <dd>{v.host ? [v.host.full_name, v.host.department].filter(Boolean).join(" · ") : "Reception"}</dd>
            <dt className="text-muted">Purpose</dt>
            <dd className="break-words">{v.purpose ?? "—"}</dd>
            <dt className="text-muted">Checked in</dt>
            <dd className="tabular-nums">{at(v.checked_in_at ?? v.arrived_at)} <span className="text-muted">· {SOURCE[v.source]}</span></dd>
            <dt className="text-muted">Checked out</dt>
            <dd className="tabular-nums">{at(v.checked_out_at)}</dd>
          </dl>
          {isReception && inside && (
            <form action={signOutVisit.bind(null, v.id, undefined)}>
              <button className="btn-sm border-[1.5px] border-line-input bg-surface">
                Sign out{v.visit_guests.some((g) => !g.checked_out_at) && " everyone"}
              </button>
            </form>
          )}
        </div>
      </section>

      {v.visit_guests.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-[#E3EAE6] bg-surface">
          <h2 className="h-display border-b border-[#EEF2EF] px-4 py-3.5 text-[17px]">With them ({v.visit_guests.length})</h2>
          <ul>
            {v.visit_guests.map((g) => (
              <li key={g.id} className="flex min-h-14 items-center gap-3 border-b border-[#F1F4F2] px-4 py-2 last:border-b-0">
                <span className="av size-9 text-[13px]">{initials(g.full_name)}</span>
                <span className="flex-1 text-[15px]">{g.full_name}</span>
                {g.checked_out_at
                  ? <span className="text-[13px] text-muted tabular-nums">Left {clock(g.checked_out_at)}</span>
                  : isReception && inside
                    ? <form action={signOutVisit.bind(null, v.id, g.id)}><button className="min-h-11 px-2 text-[13px] font-semibold text-brand">Sign out</button></form>
                    : <span className="text-[13px] font-medium text-brand">Inside</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
