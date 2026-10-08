"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import {
  Camera, Check, ChevronLeft, ChevronRight, CircleHelp, Lock, LogOut, Plus, ScanLine, Search, Ticket, User, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { notifyDeskCheckIn } from "./actions";
import { QrScanner } from "./qr-scanner";

const PURPOSES = ["Meeting", "Interview", "Delivery", "Contractor", "Other"];
const IDLE_MS = 60_000;
const DONE_MS = 8_000;

type Step = "welcome" | "invite" | "guests" | "details" | "host" | "photo" | "done" | "leave" | "left";
export type Host = { id: string | null; full_name: string; department: string | null };
export type Invite = {
  invite_id: string; visitor_name: string; visitor_company: string | null; purpose: string | null;
  host_id: string; host_name: string; host_department: string | null; guests: string[];
};
export type CheckInInput = {
  name: string; company: string; mobile: string; purpose: string;
  hostId: string | null; guests: string[]; photo: Blob; inviteId: string | null;
};
type OpenVisit = { visit_id: string; visitor: string; checked_in_at: string; host: string; guests: number };
type Done = { first: string; host: string; at: string; guests: string[] };

// What the screens need. The desk device talks to Supabase as itself; a visitor's own phone goes
// through server actions (see app/visit). Sign-out from the desk only: phones sign out on their status page.
export type FlowApi = {
  searchHosts(q: string): Promise<Host[]>;
  redeemInvite(code: string): Promise<Invite | null>;
  checkIn(input: CheckInInput): Promise<{ error: string } | { hostName: string | null; at: string }>;
  findOpen?(q: string): Promise<OpenVisit[]>;
  signOut?(visitId: string): Promise<boolean>;
};

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

// ---------------------------------------------------------------- desk device

const supabase = createClient();
const deskApi: FlowApi = {
  async searchHosts(q) {
    const { data } = await supabase.rpc("kiosk_search_hosts", { q });
    return (data as Host[]) ?? [];
  },
  async redeemInvite(code) {
    const { data } = await supabase.rpc("kiosk_redeem_invite", { p_code: code }).maybeSingle<Invite>();
    return data;
  },
  async checkIn(i) {
    const path = `desk/${crypto.randomUUID()}.jpg`;
    const up = await supabase.storage.from("visit-photos").upload(path, i.photo, { contentType: "image/jpeg" });
    if (up.error) return { error: "We couldn't save your photo. Please try again." };
    const { data, error } = await supabase
      .rpc("kiosk_check_in", {
        p_visitor_name: i.name, p_company: i.company, p_mobile: i.mobile, p_purpose: i.purpose,
        p_host_id: i.hostId, p_guests: i.guests, p_photo_path: path, p_invite_id: i.inviteId,
      })
      .single<{ visit_id: string; checked_in_at: string; host_name: string | null }>();
    if (error || !data) {
      return { error: /invite/.test(error?.message ?? "") ? "That invite has already been used. Please ask at reception." : "Something went wrong checking you in. Please ask at reception." };
    }
    notifyDeskCheckIn(data.visit_id).catch(() => {}); // a failed email shows in the lobby with Resend
    return { hostName: data.host_name, at: data.checked_in_at };
  },
  async findOpen(q) {
    const { data } = await supabase.rpc("kiosk_find_open_visits", { q });
    return (data as OpenVisit[]) ?? [];
  },
  async signOut(id) {
    const { data, error } = await supabase.rpc("kiosk_sign_out", { p_visit_id: id });
    return !error && !!data;
  },
};

export function KioskFlow() {
  return <CheckInFlow api={deskApi} desk />;
}

// ---------------------------------------------------------------- shared screens

export function CheckInFlow({ api, desk, initialCode = "", onCheckedIn }: {
  api: FlowApi;
  desk?: boolean;
  initialCode?: string;
  onCheckedIn?: () => void; // own phone: hand over to the status page instead of the Done screen
}) {
  const [step, setStep] = useState<Step>(initialCode ? "invite" : "welcome");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [mobile, setMobile] = useState("");
  const [purpose, setPurpose] = useState("Meeting");
  const [guests, setGuests] = useState<string[]>([]);
  const [host, setHost] = useState<Host | null>(null);
  const [inviteId, setInviteId] = useState<string | null>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setStep("welcome");
    setName(""); setCompany(""); setMobile(""); setPurpose("Meeting"); setInviteId(null);
    setGuests([]); setHost(null); setPhoto(null); setDone(null); setError(""); setBusy(false);
  }

  // Desk only: back to the start after a minute of no touch, so the next visitor never sees someone's details.
  useEffect(() => {
    if (!desk || step === "welcome") return;
    let t = setTimeout(reset, step === "done" || step === "left" ? DONE_MS : IDLE_MS);
    if (step === "done" || step === "left") return () => clearTimeout(t);
    const poke = () => { clearTimeout(t); t = setTimeout(reset, IDLE_MS); };
    window.addEventListener("pointerdown", poke);
    window.addEventListener("keydown", poke);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointerdown", poke);
      window.removeEventListener("keydown", poke);
    };
  }, [step, desk]);

  function applyInvite(i: Invite) {
    setInviteId(i.invite_id);
    setName(i.visitor_name);
    setCompany(i.visitor_company ?? "");
    setPurpose(i.purpose ?? "Meeting");
    setHost({ id: i.host_id, full_name: i.host_name, department: i.host_department });
    setGuests(i.guests);
    setStep("guests");
  }

  async function checkIn() {
    if (!photo || !host) return;
    setBusy(true);
    setError("");
    const named = guests.map((g) => g.trim());
    const r = await api.checkIn({ name, company, mobile, purpose, hostId: host.id, guests: named, photo, inviteId });
    if ("error" in r) {
      setError(r.error);
      setBusy(false);
      return;
    }
    if (onCheckedIn) return onCheckedIn();
    setDone({ first: name.trim().split(/\s+/)[0], host: r.hostName ?? "Reception", at: r.at, guests: named });
    setBusy(false);
    setStep("done");
  }

  const steps: Partial<Record<Step, number>> = inviteId ? { guests: 1, photo: 2 } : { details: 1, host: 2, photo: 3 };
  const total = inviteId ? 2 : 3;
  const back: Partial<Record<Step, Step>> = {
    invite: "welcome", guests: "invite", details: "welcome", host: "details", photo: inviteId ? "guests" : "host", leave: "welcome",
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col p-6">
      {back[step] && (
        <nav className="flex items-center justify-between text-[15px] font-medium text-ink-2">
          <button className="-ml-2 flex min-h-11 items-center gap-0.5 px-2" onClick={() => { setError(""); setStep(back[step]!); }}>
            <ChevronLeft className="size-5" /> Back
          </button>
          {steps[step] && <span>Step {steps[step]} of {total}</span>}
        </nav>
      )}
      {steps[step] && (
        <div className="mt-3 flex gap-1.5" aria-hidden>
          {Array.from({ length: total }, (_, n) => (
            <i key={n} className={`h-1 flex-1 rounded-full ${n < steps[step]! ? "bg-brand" : "bg-line"}`} />
          ))}
        </div>
      )}

      {step === "welcome" && (
        <Welcome
          onInvite={() => setStep("invite")}
          onWalkIn={() => { setInviteId(null); setStep("details"); }}
          onLeave={api.signOut ? () => setStep("leave") : undefined}
        />
      )}

      {step === "invite" && <InviteStep api={api} initialCode={initialCode} onFound={applyInvite} scan={desk} />}

      {step === "guests" && (
        <form className="flex flex-1 flex-col" onSubmit={(e) => { e.preventDefault(); setStep("photo"); }}>
          <h2 className="h-display mt-6 mb-2 text-[29px]">Anyone with you today?</h2>
          <p className="text-[15.5px] text-ink-2">{guests.length ? `${host?.full_name} is expecting these people. Change it if needed.` : "Add anyone who came with you."}</p>
          <div className="mt-4"><Guests guests={guests} setGuests={setGuests} /></div>
          <div className="flex-1" />
          <button className="btn mt-6 w-full">Continue</button>
        </form>
      )}

      {step === "details" && (
        <form className="flex flex-1 flex-col" onSubmit={(e) => { e.preventDefault(); setStep("host"); }}>
          <h2 className="h-display mt-6 mb-2 text-[29px]">Tell us about you</h2>
          <Field label="Full name" required>
            <input className="input" required maxLength={120} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Company">
            <input className="input" maxLength={120} autoComplete="organization" value={company} onChange={(e) => setCompany(e.target.value)} />
          </Field>
          <Field label="Mobile number" optional>
            <input className="input" type="tel" maxLength={30} autoComplete="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} />
          </Field>
          <Field label="People with you"><Guests guests={guests} setGuests={setGuests} /></Field>
          <Field label="Purpose of visit">
            <div className="flex flex-wrap gap-2">
              {PURPOSES.map((p) => (
                <button key={p} type="button" className="chip" aria-pressed={purpose === p} onClick={() => setPurpose(p)}>{p}</button>
              ))}
            </div>
          </Field>
          <div className="flex-1" />
          <button className="btn mt-6 w-full">Continue</button>
        </form>
      )}

      {step === "host" && <HostStep api={api} host={host} setHost={setHost} onNext={() => setStep("photo")} />}

      {step === "photo" && (
        <PhotoStep photo={photo} setPhoto={setPhoto} busy={busy} error={error} onSubmit={checkIn} />
      )}

      {step === "done" && done && (
        <Finished
          title={`You're checked in, ${done.first}.`}
          lead={done.host === "Reception"
            ? "Please take a seat. Reception will be with you shortly."
            : `We've let ${done.host} know. Please take a seat; they'll come to collect you.`}
          onDone={reset}
        >
          <div className="mt-5 rounded-2xl border-[1.5px] border-line bg-surface px-4 py-1 text-sm">
            <Row k="Visiting" v={done.host} />
            <Row k="Checked in" v={time(done.at)} />
            {done.guests.length > 0 && <Row k="With you" v={done.guests.join(", ")} />}
          </div>
        </Finished>
      )}

      {step === "leave" && api.findOpen && api.signOut && <LeaveStep api={api} onLeft={() => setStep("left")} />}

      {step === "left" && (
        <Finished title="You're signed out." lead="Thanks for visiting Novelty Labels. Have a good day." onDone={reset} />
      )}
    </main>
  );
}

function Welcome({ onInvite, onWalkIn, onLeave }: { onInvite: () => void; onWalkIn: () => void; onLeave?: () => void }) {
  return (
    <>
      <Image src="/logo.png" alt="Novelty Labels" width={136} height={34} className="h-[34px] w-auto self-start" priority />
      <div className="flex flex-1 flex-col justify-center py-8">
        <p className="font-display text-[13px] font-semibold uppercase tracking-[.16em] text-brand">Visitor check-in</p>
        <h1 className="h-display my-3 text-[38px] leading-[1.05]">Welcome to<br />Novelty Labels.</h1>
        <p className="text-[15.5px] leading-relaxed text-ink-2">Takes about a minute. Your host is told as soon as you&apos;re in.</p>
      </div>
      <div className="flex flex-col gap-2.5">
        <Tile primary icon={<Ticket />} title="I have an invite" sub="Use the code from your invitation" onClick={onInvite} />
        <Tile icon={<User />} title="No invite" sub="Tell us who you're here to see" onClick={onWalkIn} />
        {onLeave && <Tile icon={<LogOut />} title="I'm leaving" sub="Sign out of your visit" onClick={onLeave} />}
      </div>
      <p className="mt-5 text-[12.5px] text-muted">Need a hand? Ask at reception.</p>
    </>
  );
}

function Tile({ primary, icon, title, sub, onClick }: { primary?: boolean; icon: ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-3.5 rounded-2xl border-[1.5px] p-4 text-left ${primary ? "border-brand bg-brand text-white shadow-[0_8px_20px_rgba(16,85,63,.22)]" : "border-line bg-surface"}`}>
      <span className={`grid size-[46px] shrink-0 place-items-center rounded-xl [&>svg]:size-[23px] ${primary ? "bg-white/13" : "bg-tint text-brand"}`}>{icon}</span>
      <span>
        <b className="block font-display text-[19px] font-semibold leading-tight">{title}</b>
        <span className={`text-[13px] ${primary ? "text-white/80" : "text-ink-2"}`}>{sub}</span>
      </span>
      <ChevronRight className="ml-auto size-5 opacity-50" />
    </button>
  );
}

// scan: the desk tablet can read the QR from the invitation email with its camera.
function InviteStep({ api, initialCode, onFound, scan }: { api: FlowApi; initialCode: string; onFound: (i: Invite) => void; scan?: boolean }) {
  const [code, setCode] = useState(initialCode);
  const [found, setFound] = useState<Invite | null>(null);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function look(e?: FormEvent, c = code) {
    e?.preventDefault();
    setBusy(true);
    setError("");
    const i = await api.redeemInvite(c).catch(() => null);
    setBusy(false);
    if (!i) return setError("That code isn't valid today. Check it, or go back and check in without an invite.");
    setFound(i);
  }

  if (found) {
    return (
      <div className="flex flex-1 flex-col">
        <h2 className="h-display mt-6 mb-4 text-[29px]">Is this you?</h2>
        <div className="rounded-2xl border-[1.5px] border-line bg-surface px-4 py-1 text-sm">
          <Row k="Name" v={found.visitor_name} />
          {found.visitor_company && <Row k="Company" v={found.visitor_company} />}
          <Row k="Visiting" v={found.host_name} />
        </div>
        <div className="flex-1" />
        <div className="mt-6 flex gap-2.5">
          <button className="btn-ghost flex-1" onClick={() => { setFound(null); setCode(""); }}>Not me</button>
          <button className="btn flex-[2]" onClick={() => onFound(found)}>Yes, that&apos;s me</button>
        </div>
      </div>
    );
  }

  if (scanning) {
    return (
      <QrScanner
        onClose={() => setScanning(false)}
        onCode={(c) => { setScanning(false); setCode(`${c.slice(0, 3)}-${c.slice(3)}`); look(undefined, c); }}
      />
    );
  }

  return (
    <form className="flex flex-1 flex-col" onSubmit={look}>
      <h2 className="h-display mt-6 mb-2 text-[29px]">Your invite code</h2>
      <p className="mb-4 text-[15.5px] text-ink-2">It&apos;s in your invitation email: six letters and numbers.</p>
      {scan && (
        <>
          <button type="button" className="btn mb-4 w-full" onClick={() => { setError(""); setScanning(true); }}>
            <ScanLine className="size-5" /> Scan QR code
          </button>
          <p className="mb-3 text-center text-[13px] text-muted">or type it</p>
        </>
      )}
      <input className="input text-center font-display text-2xl tracking-[.3em] uppercase" maxLength={7} autoFocus
        autoComplete="off" autoCapitalize="characters" aria-label="Invite code" placeholder="XXX-XXX"
        value={code} onChange={(e) => setCode(e.target.value)} required />
      {error && <p role="alert" className="mt-3 text-sm font-medium text-danger">{error}</p>}
      <div className="flex-1" />
      <button className="btn mt-6 w-full" disabled={busy || code.replace(/[^a-z0-9]/gi, "").length !== 6}>
        {busy ? "Checking…" : "Continue"}
      </button>
    </form>
  );
}

function Guests({ guests, setGuests }: { guests: string[]; setGuests: (g: string[]) => void }) {
  return (
    <div className="flex flex-col gap-2">
      {guests.length === 0 && <p className="text-[15px] text-ink-2">Just me</p>}
      {guests.map((g, i) => (
        <div key={i} className="flex gap-2">
          <input
            className="input" required maxLength={120} aria-label={`Person ${i + 2} full name`} placeholder="Full name"
            value={g} onChange={(e) => setGuests(guests.map((x, j) => (j === i ? e.target.value : x)))}
          />
          <button type="button" aria-label="Remove person" className="grid size-[52px] shrink-0 place-items-center rounded-xl border-[1.5px] border-line-input bg-surface"
            onClick={() => setGuests(guests.filter((_, j) => j !== i))}>
            <X className="size-5" />
          </button>
        </div>
      ))}
      {guests.length < 20 && (
        <button type="button" className="flex min-h-11 items-center gap-1.5 self-start font-semibold text-brand" onClick={() => setGuests([...guests, ""])}>
          <Plus className="size-5" /> Add a person
        </button>
      )}
    </div>
  );
}

function HostStep({ api, host, setHost, onNext }: { api: FlowApi; host: Host | null; setHost: (h: Host) => void; onNext: () => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Host[]>([]);
  useEffect(() => {
    if (!q.trim()) return;
    const t = setTimeout(async () => setHits(await api.searchHosts(q).catch(() => [])), 200);
    return () => clearTimeout(t);
  }, [q, api]);
  const reception: Host = { id: null, full_name: "Reception", department: null };
  const shown = q.trim() ? hits : [];

  return (
    <div className="flex flex-1 flex-col">
      <h2 className="h-display mt-6 mb-4 text-[29px]">Who are you here to see?</h2>
      <label className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted" />
        <input className="input pl-11" autoFocus placeholder="Search by name" aria-label="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="mt-3.5 flex flex-col gap-2">
        {shown.map((h) => (
          <PersonRow key={h.id} selected={host?.id === h.id} avatar={initials(h.full_name)} title={h.full_name} sub={h.department ?? ""} onClick={() => setHost(h)} />
        ))}
        {q.trim() && shown.length === 0 && <p className="px-1 text-sm text-muted">No one by that name. Try another spelling, or pick Reception.</p>}
        <PersonRow dashed selected={host !== null && host.id === null} avatar={<CircleHelp className="size-5" />} title="Not sure?" sub="Pick Reception and we'll help" onClick={() => setHost(reception)} />
      </div>
      <div className="flex-1" />
      <button className="btn mt-6 w-full" disabled={!host} onClick={onNext}>Continue</button>
    </div>
  );
}

function PersonRow({ selected, dashed, avatar, title, sub, onClick }: { selected?: boolean; dashed?: boolean; avatar: ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-pressed={selected}
      className={`flex items-center gap-3 rounded-[14px] px-3.5 py-3 text-left ${selected ? "border-2 border-brand bg-[#F3F8F5]" : `border-[1.5px] border-[#E3EAE6] ${dashed ? "border-dashed" : "bg-surface"}`}`}>
      <span className="av">{avatar}</span>
      <span className="min-w-0">
        <b className="block text-[15.5px] font-semibold">{title}</b>
        <span className="text-[13px] text-ink-2">{sub}</span>
      </span>
      {selected && <Check className="ml-auto size-[22px] text-brand" />}
    </button>
  );
}

function PhotoStep({ photo, setPhoto, busy, error, onSubmit }: { photo: Blob | null; setPhoto: (b: Blob) => void; busy: boolean; error: string; onSubmit: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const url = useMemo(() => (photo ? URL.createObjectURL(photo) : ""), [photo]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  return (
    <div className="flex flex-1 flex-col">
      <h2 className="h-display mt-6 mb-2 text-[29px]">Quick photo</h2>
      <p className="text-[15.5px] text-ink-2">So reception and your host know who to look for.</p>
      {/* ponytail: native camera via <input capture>; swap for an in-page viewfinder with the oval guide if the desk device needs it. */}
      <button type="button" onClick={() => input.current?.click()}
        className="relative mt-4 grid min-h-72 flex-1 place-items-center overflow-hidden rounded-[20px] bg-[radial-gradient(120%_90%_at_50%_35%,#33473F_0%,#16231D_70%)] text-white">
        {url
          // eslint-disable-next-line @next/next/no-img-element -- local blob preview, nothing to optimise
          ? <img src={url} alt="Your photo" className="absolute inset-0 size-full object-cover" />
          : <span className="flex flex-col items-center gap-2 font-medium"><Camera className="size-10" />Tap to take your photo</span>}
      </button>
      <input ref={input} type="file" accept="image/*" capture="user" hidden
        onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPhoto(await toJpeg(f)); e.target.value = ""; }} />
      <p className="mt-3.5 flex gap-2 text-[13px] text-muted"><Lock className="mt-0.5 size-4 shrink-0 text-brand" />Only reception and your host can see it. Deleted after 90 days.</p>
      {error && <p role="alert" className="mt-3 rounded-xl bg-[#FEE4E2] px-3.5 py-2.5 text-sm font-medium text-danger">{error}</p>}
      <div className="mt-4 flex gap-2.5">
        {photo && <button type="button" className="btn-ghost flex-1" disabled={busy} onClick={() => input.current?.click()}>Retake</button>}
        <button className="btn flex-[2]" disabled={!photo || busy} onClick={onSubmit}>{busy ? "Checking you in…" : "Check in"}</button>
      </div>
    </div>
  );
}

function LeaveStep({ api, onLeft }: { api: FlowApi; onLeft: () => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<OpenVisit[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (q.trim().length < 3) return;
    const t = setTimeout(async () => setHits(await api.findOpen!(q).catch(() => [])), 250);
    return () => clearTimeout(t);
  }, [q, api]);
  const shown = q.trim().length >= 3 ? hits : [];

  async function signOut(id: string) {
    if (!(await api.signOut!(id))) return setError("We couldn't sign you out. Please ask at reception.");
    onLeft();
  }

  return (
    <div className="flex flex-1 flex-col">
      <h2 className="h-display mt-6 mb-2 text-[29px]">Signing out</h2>
      <p className="mb-4 text-[15.5px] text-ink-2">Type the first few letters of your name.</p>
      <label className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted" />
        <input className="input pl-11" autoFocus aria-label="Your name" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="mt-3.5 flex flex-col gap-2">
        {shown.map((v) => (
          <button key={v.visit_id} onClick={() => signOut(v.visit_id)} className="flex items-center gap-3 rounded-[14px] border-[1.5px] border-[#E3EAE6] bg-surface px-3.5 py-3 text-left">
            <span className="av">{initials(v.visitor)}</span>
            <span>
              <b className="block text-[15.5px] font-semibold">{v.visitor}{v.guests > 0 && ` +${v.guests}`}</b>
              <span className="text-[13px] text-ink-2">In since {time(v.checked_in_at)} · visiting {v.host}</span>
            </span>
            <LogOut className="ml-auto size-5 text-brand" />
          </button>
        ))}
        {q.trim().length >= 3 && shown.length === 0 && <p className="px-1 text-sm text-muted">No open visit found today. Please ask at reception.</p>}
      </div>
      {error && <p role="alert" className="mt-3 text-sm font-medium text-danger">{error}</p>}
      <div className="flex-1" />
      <p className="mt-6 text-[13px] text-muted">Only today&apos;s visits are listed, by first name and last initial, so no one&apos;s full details are on show. Signing out signs out your whole group.</p>
    </div>
  );
}

export function Finished({ title, lead, onDone, children }: { title: string; lead: string; onDone?: () => void; children?: ReactNode }) {
  return (
    <>
      <div className="flex flex-1 flex-col justify-center">
        <span className="mb-5 grid size-[84px] place-items-center rounded-full bg-tint text-brand"><Check className="size-10" strokeWidth={2.5} /></span>
        <h1 className="h-display mb-3 text-[38px] leading-[1.05]">{title}</h1>
        <p className="text-[15.5px] leading-relaxed text-ink-2">{lead}</p>
        {children}
      </div>
      {onDone && (
        <>
          <button className="btn-ghost w-full" onClick={onDone}>Done</button>
          <p className="mt-2.5 text-center text-[13px] text-muted">Back to the start in a few seconds</p>
        </>
      )}
    </>
  );
}

function Field({ label, required, optional, children }: { label: string; required?: boolean; optional?: boolean; children: ReactNode }) {
  return (
    <div className="mt-4">
      <span className="label">
        {label}
        {required && <em className="not-italic text-danger"> *</em>}
        {optional && <span className="ml-1 font-normal text-muted">optional</span>}
      </span>
      {children}
    </div>
  );
}

export function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-t border-[#EEF2EF] py-3 first:border-t-0">
      <span className="text-muted">{k}</span>
      <b className="text-right font-semibold">{v}</b>
    </div>
  );
}

// Phone cameras give multi-MB photos (sometimes not JPEG); shrink to a 900px JPEG before upload.
async function toJpeg(file: File): Promise<Blob> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 900 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.85),
  );
}
