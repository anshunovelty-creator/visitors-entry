import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import QRCode from "qrcode";
import { siteOrigin } from "@/lib/email";
import { getStaff } from "../../reception/staff";

// Printable A4 poster for the entrance: visitors scan it to check in on their own phone.
export default function PosterPage() {
  return (
    <Suspense fallback={<p className="p-8 text-muted">Loading…</p>}>
      <Poster />
    </Suspense>
  );
}

async function Poster() {
  const { me } = await getStaff();
  if (me.role !== "admin") return <p className="p-8 text-ink-2">This page is for admins.</p>;
  const url = `${await siteOrigin()}/visit`;
  // Generated here from our own URL, so the SVG markup is trusted.
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0e1f18", light: "#ffffff" } });

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col items-center gap-6 p-8 text-center print:p-0">
      <p className="flex w-full justify-between text-[13.5px] print:hidden">
        <Link href="/admin" className="font-semibold text-brand">← Admin</Link>
        <span className="text-muted">Print with Ctrl/⌘ + P</span>
      </p>
      <Image src="/logo.png" alt="Novelty Labels" width={200} height={50} className="h-12 w-auto" priority />
      <h1 className="h-display text-[44px] leading-[1.05]">Visiting us?<br />Check in here.</h1>
      <div className="w-full max-w-[380px] rounded-3xl border-2 border-ink p-5 [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="text-[19px] text-ink-2">Scan with your phone camera.<br />Takes about a minute.</p>
      <p className="font-display text-[17px] font-semibold text-brand">{url.replace(/^https?:\/\//, "")}</p>
      <p className="text-[14px] text-muted">No phone? Use the tablet at reception.</p>
    </main>
  );
}
