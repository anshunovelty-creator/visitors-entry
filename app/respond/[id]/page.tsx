import { Suspense } from "react";
import Image from "next/image";
import type { Metadata } from "next";
import { Check } from "lucide-react";
import { connection } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { linkSecret, type HostResponse } from "@/lib/email";
import { sign, verify } from "@/lib/sign";
import { respondFromEmail } from "./actions";

export const metadata: Metadata = { title: "Your visitor · Novelty Labels" };

// Opened from the "your visitor is here" email. Nothing happens until the host taps the button:
// mail scanners open links on their own, and that mustn't count as an answer.
export default function RespondPage({ params, searchParams }: PageProps<"/respond/[id]">) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 p-6">
      <Image src="/logo.png" alt="Novelty Labels" width={136} height={34} className="h-[34px] w-auto self-start" />
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Respond params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const LABEL = { coming: "I'm coming down", unavailable: "I'm not available" } as const;

async function Respond({ params, searchParams }: Pick<PageProps<"/respond/[id]">, "params" | "searchParams">) {
  await connection();
  const { id } = await params;
  const sp = await searchParams;
  const r = String(sp.r ?? "") as HostResponse;
  const s = String(sp.s ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id) || !(r in LABEL) || !verify(linkSecret(), id, r, s)) {
    return <p className="text-[15.5px] text-ink-2">This link isn&apos;t valid. Open the latest email about your visitor, or ask reception.</p>;
  }

  const { data: v } = await createAdminClient().from("visits")
    .select("visitor_name, company, status, host_response").eq("id", id).maybeSingle();
  if (!v) return <p className="text-[15.5px] text-ink-2">This visit no longer exists.</p>;
  const who = v.company ? `${v.visitor_name} (${v.company})` : v.visitor_name;
  if (!["arriving", "checked_in"].includes(v.status)) {
    return <p className="text-[15.5px] text-ink-2">{who} has already left, so there&apos;s nothing to answer.</p>;
  }

  const other: HostResponse = r === "coming" ? "unavailable" : "coming";
  const otherLink = `/respond/${id}?r=${other}&s=${sign(linkSecret(), id, other)}`;
  if (v.host_response === r) {
    return (
      <>
        <span className="grid size-16 place-items-center rounded-full bg-tint text-brand"><Check className="size-8" strokeWidth={2.5} /></span>
        <h1 className="h-display text-[30px] leading-tight">Thanks. Reception knows.</h1>
        <p className="text-[15.5px] text-ink-2">
          {r === "coming" ? `${who} will be told you're on your way.` : `Reception will look after ${who}.`}
        </p>
        <a href={otherLink} className="text-[14px] font-semibold text-brand">Change to “{LABEL[other]}”</a>
      </>
    );
  }

  return (
    <>
      <h1 className="h-display text-[30px] leading-tight">{who} is here to see you.</h1>
      <form action={respondFromEmail.bind(null, id, r, s)}>
        <button className={`btn w-full ${r === "unavailable" ? "bg-danger hover:bg-danger" : ""}`}>{LABEL[r]}</button>
      </form>
      <a href={otherLink} className="text-center text-[14px] font-semibold text-brand">{LABEL[other]} instead</a>
    </>
  );
}
