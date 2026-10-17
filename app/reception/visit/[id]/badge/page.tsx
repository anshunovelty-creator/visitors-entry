import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { ChevronLeft } from "lucide-react";
import { PrintButton } from "../../../roll-call/print-button";
import { getStaff, initials, photoSrc, TZ } from "../../../staff";

// Label size for the badge printer. 4 × 3 in fits most visitor-badge labels and plain cards;
// change both numbers for a different roll (e.g. 62mm × 100mm on a Brother).
const BADGE_W = "4in";
const BADGE_H = "3in";

export default function BadgePage({ params }: PageProps<"/reception/visit/[id]/badge">) {
  return (
    <main className="flex min-w-0 flex-1 flex-col items-center gap-5 p-4 lg:px-8 lg:py-7 print:block print:p-0">
      <Suspense fallback={<p className="text-muted">Loading the badge…</p>}>
        <Badge params={params} />
      </Suspense>
    </main>
  );
}

async function Badge({ params }: Pick<PageProps<"/reception/visit/[id]/badge">, "params">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase } = await getStaff();
  const { data: v } = await supabase.from("visits")
    .select("id, visitor_name, company, photo_path, checked_in_at, arrived_at, vehicle_no, host:staff!visits_host_id_fkey(full_name, department), visit_guests(count)")
    .eq("id", id).maybeSingle();
  if (!v) notFound();
  const host = v.host as unknown as { full_name: string; department: string | null } | null;
  const guests = (v.visit_guests as { count: number }[])[0]?.count ?? 0;
  // Scanned at the desk tablet's "Signing out" screen.
  const qr = await QRCode.toString(`VB:${v.id}`, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0e1f18", light: "#ffffff" } });
  const day = new Date(v.checked_in_at ?? v.arrived_at).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: TZ });

  return (
    <>
      <style>{`@page { size: ${BADGE_W} ${BADGE_H}; margin: 0; } @media print { body { background: #fff; } }`}</style>
      <div className="flex w-full max-w-md items-center gap-3 print:hidden">
        <Link href={`/reception/visit/${v.id}`} className="flex min-h-11 items-center text-[15px] font-medium text-ink-2"><ChevronLeft className="size-5" />Visit</Link>
        <span className="flex-1" />
        <PrintButton label="Print badge" />
      </div>

      <article style={{ width: BADGE_W, height: BADGE_H }}
        className="flex flex-col overflow-hidden rounded-xl border border-line bg-white text-[#0e1f18] shadow-sm print:rounded-none print:border-0 print:shadow-none">
        <header className="flex items-center justify-between bg-[#10553f] px-[0.18in] py-[0.07in] text-white">
          <b className="font-display text-[15pt] tracking-[.18em]">VISITOR</b>
          <span className="text-[8.5pt] font-medium">Novelty Labels</span>
        </header>
        <div className="flex flex-1 gap-[0.14in] px-[0.18in] pt-[0.14in]">
          <div className="grid size-[1.15in] shrink-0 place-items-center overflow-hidden rounded-md bg-[#D9E4DE] font-display text-[22pt]">
            {v.photo_path
              // eslint-disable-next-line @next/next/no-img-element -- private photo; the image optimiser must not cache it
              ? <img src={photoSrc(v.photo_path)} alt="" className="size-full object-cover" />
              : initials(v.visitor_name)}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[17pt] leading-[1.05] font-semibold break-words">{v.visitor_name}</h1>
            {v.company && <p className="mt-[0.03in] truncate text-[10pt]">{v.company}</p>}
            <p className="mt-[0.08in] text-[8.5pt] text-[#4a5b53]">Visiting</p>
            <p className="truncate text-[10.5pt] font-semibold">{host?.full_name ?? "Reception"}</p>
            {guests > 0 && <p className="text-[8.5pt] text-[#4a5b53]">+{guests} with them</p>}
          </div>
        </div>
        <footer className="flex items-end gap-[0.12in] px-[0.18in] pb-[0.12in]">
          <div className="min-w-0 flex-1 text-[8.5pt] leading-snug">
            <p className="font-semibold">Valid {day} only</p>
            {v.vehicle_no && <p>Vehicle {v.vehicle_no}</p>}
            <p className="text-[#4a5b53]">Wear this badge at all times. Scan it at the desk when you leave.</p>
          </div>
          <div className="size-[0.72in] shrink-0" dangerouslySetInnerHTML={{ __html: qr }} />
        </footer>
      </article>
    </>
  );
}
