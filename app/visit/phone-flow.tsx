"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { Clock, LogOut, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CheckInFlow, Finished, Row, type FlowApi, type Invite } from "../kiosk/kiosk-flow";
import { phoneCheckIn, phoneSignOut, redeemInvite, searchHosts, startPhotoUpload, visitStatus, type PhoneVisit } from "./actions";

const KEY = "nl-visit-token";
const POLL_MS = 4_000;
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const subscribe = (cb: () => void) => { window.addEventListener("storage", cb); return () => window.removeEventListener("storage", cb); };
const write = (t: string | null) => { try { if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); } catch {} };

export function PhoneFlow() {
  const code = useSearchParams().get("code") ?? "";
  // The visit token lives on this phone only. Undefined on the server (no localStorage there).
  const stored = useSyncExternalStore(subscribe, read, () => undefined);
  const [changed, setToken] = useState<string | null | undefined>(undefined);
  const token = changed !== undefined ? changed : stored;
  const pending = useRef<string | null>(null);

  const api: FlowApi = {
    searchHosts,
    redeemInvite: (c) => redeemInvite(c) as Promise<Invite | null>,
    async checkIn(i) {
      const up = await startPhotoUpload();
      if ("error" in up) return up;
      const { error } = await createClient().storage.from("visit-photos")
        .uploadToSignedUrl(up.path, up.token, i.photo, { contentType: "image/jpeg" });
      if (error) return { error: "We couldn't save your photo. Please try again." };
      const r = await phoneCheckIn({
        name: i.name, company: i.company, mobile: i.mobile, purpose: i.purpose,
        hostId: i.hostId, guests: i.guests, inviteId: i.inviteId, photoPath: up.path,
      });
      if ("error" in r) return r;
      pending.current = r.token;
      return { hostName: null, at: new Date().toISOString() };
    },
  };

  if (token === undefined) return null;
  if (token) return <Status token={token} onNew={() => { write(null); setToken(null); }} />;
  return (
    <CheckInFlow api={api} initialCode={code}
      onCheckedIn={() => { write(pending.current); setToken(pending.current); }} />
  );
}

function Status({ token, onNew }: { token: string; onNew: () => void }) {
  const [v, setV] = useState<PhoneVisit | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    const tick = async () => {
      const s = await visitStatus(token).catch(() => undefined);
      if (!live || s === undefined) return;
      if (s === null) return onNew(); // visit gone: start fresh
      setV(s);
    };
    tick();
    const t = setInterval(tick, POLL_MS);
    return () => { live = false; clearInterval(t); };
  }, [token, onNew]);

  const main = "mx-auto flex min-h-dvh w-full max-w-xl flex-col p-6";
  if (!v) return <main className={main}><p className="m-auto text-muted">Loading your visit…</p></main>;

  if (v.status === "arriving") {
    return (
      <main className={main}>
        <div className="flex flex-1 flex-col justify-center">
          <span className="mb-5 grid size-[84px] place-items-center rounded-full bg-warn-bg text-warn-ink"><Clock className="size-10" /></span>
          <h1 className="h-display mb-3 text-[34px] leading-[1.05]">Almost there, {v.first}.</h1>
          <p className="text-[15.5px] leading-relaxed text-ink-2">Show this code at reception. This page updates by itself once they confirm.</p>
          <p className="my-8 text-center font-display text-[72px] leading-none font-semibold tracking-[.12em] text-brand" aria-label={`Your code is ${v.code?.split("").join(" ")}`}>{v.code}</p>
          <div className="rounded-2xl border-[1.5px] border-line bg-surface px-4 py-1 text-sm">
            <Row k="Visiting" v={v.host} />
            {v.guests > 0 && <Row k="With you" v={`${v.guests} ${v.guests === 1 ? "person" : "people"}`} />}
          </div>
        </div>
      </main>
    );
  }

  if (v.status === "checked_in") {
    return (
      <main className={main}>
        <Finished title={`You're all set, ${v.first}.`}
          lead={v.host === "Reception" ? "Please take a seat. Reception will be with you shortly." : `${v.host} knows you're here. Please take a seat; they'll come to collect you.`}>
          <p className="mt-5 text-[14px] text-muted">Keep this page. When you leave, sign out here.</p>
        </Finished>
        <button className="btn w-full" disabled={busy} onClick={async () => {
          setBusy(true);
          if (await phoneSignOut(token)) setV({ ...v, status: "checked_out" });
          setBusy(false);
        }}>
          <LogOut className="size-5" /> {busy ? "Signing out…" : v.guests > 0 ? `Sign out (with ${v.guests} other${v.guests === 1 ? "" : "s"})` : "Sign out"}
        </button>
      </main>
    );
  }

  if (v.status === "checked_out") {
    return (
      <main className={main}>
        <Finished title="You're signed out." lead="Thanks for visiting Novelty Labels. Have a good day." />
        <button className="btn-ghost w-full" onClick={onNew}>Start a new check-in</button>
      </main>
    );
  }

  return (
    <main className={main}>
      <div className="flex flex-1 flex-col justify-center">
        <span className="mb-5 grid size-[84px] place-items-center rounded-full bg-[#FEE4E2] text-danger"><TriangleAlert className="size-10" /></span>
        <h1 className="h-display mb-3 text-[34px] leading-[1.05]">Please speak to reception.</h1>
        <p className="text-[15.5px] leading-relaxed text-ink-2">
          {v.status === "expired" ? "Nobody confirmed your check-in in time." : "Reception couldn't confirm your check-in."} They&apos;ll help you from here.
        </p>
      </div>
      <button className="btn-ghost w-full" onClick={onNew}>Check in again</button>
    </main>
  );
}
