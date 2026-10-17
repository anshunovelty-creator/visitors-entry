"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Bell, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { hostRespond, savePush } from "./actions";

type Arrival = { id: string; visitor_name: string; company: string | null };
type Row = Partial<Arrival> & { status?: string; host_response?: string | null; host_reminded_at?: string | null };

const permission = () => (typeof Notification === "undefined" ? "denied" : Notification.permission);
const noop = () => () => {};
// iPhone/iPad Safari only allows notifications for an app added to the home screen.
const needsInstall = () => /iPhone|iPad|iPod/.test(navigator.userAgent) && !("PushManager" in window);

// Subscribes this browser to push (lib/push.ts) so alerts reach it with the app closed, on phones too.
async function enablePush() {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key || !("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  const reg = await navigator.serviceWorker.register("/sw.js");
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
  return savePush(JSON.parse(JSON.stringify(sub)));
}

// While any staff page is open: when one of my visitors is checked in and waiting for my approval,
// show a pop-up with Approve / Decline. With alerts on (the bell), push notifications also reach this
// device when the app is closed; email covers everyone else.
export function ArrivalAlerts({ me }: { me: string }) {
  const [waiting, setWaiting] = useState<Arrival[]>([]);
  const [asked, setAsked] = useState<NotificationPermission | null>(null);
  const [tip, setTip] = useState(false);
  const current = useSyncExternalStore(noop, permission, () => "granted" as const);
  const install = useSyncExternalStore(noop, needsInstall, () => false);
  const perm = asked ?? current;
  const pushOn = useRef(false);

  // Already allowed: (re)subscribe quietly, so this device alerts whoever is signed in now.
  useEffect(() => {
    if (permission() === "granted") enablePush().then((ok) => { pushOn.current = ok; }).catch(() => {});
  }, [me]);

  useEffect(() => {
    const supabase = createClient();
    const seen = new Set<string>();
    const channel = supabase.channel(`arrivals:${me}`).on(
      "postgres_changes",
      { event: "*", schema: "public", table: "visits", filter: `host_id=eq.${me}` },
      ({ new: row }) => {
        const v = row as Row;
        if (!v.id) return;
        if (v.status !== "checked_in" || v.host_response) {
          setWaiting((w) => w.filter((a) => a.id !== v.id)); // answered elsewhere, or left
          return;
        }
        // Once on arrival and once more on the reminder; other updates (e.g. email sent) don't count.
        const key = `${v.id}:${v.host_reminded_at ?? ""}`;
        if (seen.has(key)) return;
        seen.add(key);
        const a = { id: v.id, visitor_name: v.visitor_name ?? "A visitor", company: v.company ?? null };
        setWaiting((w) => [...w.filter((x) => x.id !== a.id), a]);
        // With push on, the service worker already shows the system notification.
        if (pushOn.current) return;
        try {
          if (permission() !== "granted") return;
          const n = new Notification(`${a.visitor_name} is ${v.host_reminded_at ? "still waiting" : "here to see you"}`, { body: "Waiting for your approval.", tag: a.id });
          n.onclick = () => { window.focus(); n.close(); };
        } catch { /* phone browsers without push: the in-page pop-up is enough */ }
      },
    ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [me]);

  const drop = (id: string) => setWaiting((w) => w.filter((a) => a.id !== id));
  const answer = (id: string, r: "coming" | "unavailable") => async () => {
    try { await hostRespond(id, r); } finally { drop(id); }
  };
  const bell = "grid size-11 place-items-center rounded-[10px] text-brand hover:bg-tint";

  return (
    <>
      {perm === "default" && (
        <button aria-label="Turn on visitor alerts" title="Turn on visitor alerts" className={bell}
          onClick={async () => {
            const p = await Notification.requestPermission();
            setAsked(p);
            if (p === "granted") pushOn.current = await enablePush().catch(() => false);
          }}>
          <Bell className="size-5" />
        </button>
      )}
      {install && (
        <button aria-label="Get visitor alerts on this iPhone" title="Get visitor alerts on this iPhone" className={bell} onClick={() => setTip((t) => !t)}>
          <Bell className="size-5" />
        </button>
      )}
      {tip && (
        <div role="status" className="fixed inset-x-4 bottom-28 z-40 mx-auto flex max-w-sm items-start gap-2 rounded-2xl border border-line bg-surface p-4 text-[14px] shadow-lg lg:bottom-6">
          <p className="flex-1">To get visitor alerts on this iPhone, tap <b>Share</b>, then <b>Add to Home Screen</b>. Open the app from there and tap the bell.</p>
          <button aria-label="Close" onClick={() => setTip(false)} className="grid size-11 shrink-0 place-items-center text-muted"><X className="size-5" /></button>
        </div>
      )}
      {waiting.length > 0 && (
        <div className="fixed inset-x-4 top-4 z-40 mx-auto flex max-w-md flex-col gap-2">
          {waiting.map((a) => (
            <div key={a.id} role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border-[1.5px] border-warn bg-surface p-4 shadow-lg">
              <span className="min-w-0 flex-1 text-[15px]">
                <b>{a.visitor_name}</b>{a.company && ` (${a.company})`} is here to see you.
              </span>
              <button aria-label="Dismiss" onClick={() => drop(a.id)} className="grid size-11 place-items-center text-muted"><X className="size-5" /></button>
              <span className="flex w-full gap-2">
                <form action={answer(a.id, "coming")} className="flex-1"><button className="btn-sm w-full bg-brand text-white">Approve</button></form>
                <form action={answer(a.id, "unavailable")} className="flex-1"><button className="btn-sm w-full border-[1.5px] border-line-input bg-surface">Decline</button></form>
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
