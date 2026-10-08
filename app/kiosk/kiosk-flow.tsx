"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import {
  Camera, Check, ChevronLeft, ChevronRight, CircleHelp, Lock, LogOut, Plus, Search, User, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const PURPOSES = ["Meeting", "Interview", "Delivery", "Contractor", "Other"];
const IDLE_MS = 60_000;
const DONE_MS = 8_000;

type Step = "welcome" | "details" | "host" | "photo" | "done" | "leave" | "left";
type Host = { id: string | null; full_name: string; department: string | null };
type OpenVisit = { visit_id: string; visitor: string; checked_in_at: string; host: string; guests: number };
type Done = { first: string; host: string; at: string; guests: string[] };

const supabase = createClient();
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

export function KioskFlow() {
  const [step, setStep] = useState<Step>("welcome");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [mobile, setMobile] = useState("");
  const [purpose, setPurpose] = useState("Meeting");
  const [guests, setGuests] = useState<string[]>([]);
  const [host, setHost] = useState<Host | null>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setStep("welcome");
    setName(""); setCompany(""); setMobile(""); setPurpose("Meeting");
    setGuests([]); setHost(null); setPhoto(null); setDone(null); setError(""); setBusy(false);
  }

  // Back to the start after a minute of no touch, so the next visitor never sees someone's details.
  useEffect(() => {
    if (step === "welcome") return;
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
  }, [step]);

  async function checkIn() {
    if (!photo || !host) return;
    setBusy(true);
    setError("");
    const path = `desk/${crypto.randomUUID()}.jpg`;
    const up = await supabase.storage.from("visit-photos").upload(path, photo, { contentType: "image/jpeg" });
    if (up.error) return fail("We couldn't save your photo. Please try again.");
    const named = guests.map((g) => g.trim());
    const { data, error } = await supabase
      .rpc("kiosk_check_in", {
        p_visitor_name: name, p_company: company, p_mobile: mobile, p_purpose: purpose,
        p_host_id: host.id, p_guests: named, p_photo_path: path,
      })
      .single<{ checked_in_at: string; host_name: string | null }>();
    if (error || !data) return fail("Something went wrong checking you in. Please ask at reception.");
    setDone({ first: name.trim().split(/\s+/)[0], host: data.host_name ?? "Reception", at: data.checked_in_at, guests: named });
    setBusy(false);
    setStep("done");
  }

  function fail(msg: string) {
    setError(msg);
    setBusy(false);
  }

  const steps = { details: 1, host: 2, photo: 3 } as const;
  const back = { details: "welcome", host: "details", photo: "host", leave: "welcome" } as const;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col p-6">
      {step in back && (
        <nav className="flex items-center justify-between text-[15px] font-medium text-ink-2">
          <button className="-ml-2 flex min-h-11 items-center gap-0.5 px-2" onClick={() => { setError(""); setStep(back[step as keyof typeof back]); }}>
            <ChevronLeft className="size-5" /> Back
          </button>
          {step in steps && <span>Step {steps[step as keyof typeof steps]} of 3</span>}
        </nav>
      )}
      {step in steps && (
        <div className="mt-3 flex gap-1.5" aria-hidden>
          {[1, 2, 3].map((n) => (
            <i key={n} className={`h-1 flex-1 rounded-full ${n <= steps[step as keyof typeof steps] ? "bg-brand" : "bg-line"}`} />
          ))}
        </div>
      )}

      {step === "welcome" && <Welcome onWalkIn={() => setStep("details")} onLeave={() => setStep("leave")} />}

      {step === "details" && (
        <form className="flex flex-1 flex-col" onSubmit={(e) => { e.preventDefault(); setStep("host"); }}>
          <h2 className="h-display mt-6 mb-2 text-[29px]">Tell us about you</h2>
          <Field label="Full name" required>
            <input className="input" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Company">
            <input className="input" autoComplete="organization" value={company} onChange={(e) => setCompany(e.target.value)} />
          </Field>
          <Field label="Mobile number" optional>
            <input className="input" type="tel" autoComplete="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} />
          </Field>
          <Field label="People with you">
            <div className="flex flex-col gap-2">
              {guests.length === 0 && <p className="text-[15px] text-ink-2">Just me</p>}
              {guests.map((g, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className="input" required aria-label={`Person ${i + 2} full name`} placeholder="Full name"
                    value={g} onChange={(e) => setGuests(guests.map((x, j) => (j === i ? e.target.value : x)))}
                  />
                  <button type="button" aria-label="Remove person" className="grid size-[52px] shrink-0 place-items-center rounded-xl border-[1.5px] border-line-input bg-surface"
                    onClick={() => setGuests(guests.filter((_, j) => j !== i))}>
                    <X className="size-5" />
                  </button>
                </div>
              ))}
              <button type="button" className="flex min-h-11 items-center gap-1.5 self-start font-semibold text-brand" onClick={() => setGuests([...guests, ""])}>
                <Plus className="size-5" /> Add a person
              </button>
            </div>
          </Field>
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

      {step === "host" && <HostStep host={host} setHost={setHost} onNext={() => setStep("photo")} />}

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

      {step === "leave" && <LeaveStep onLeft={() => setStep("left")} />}

      {step === "left" && (
        <Finished title="You're signed out." lead="Thanks for visiting Novelty Labels. Have a good day." onDone={reset} />
      )}
    </main>
  );
}

function Welcome({ onWalkIn, onLeave }: { onWalkIn: () => void; onLeave: () => void }) {
  return (
    <>
      <Image src="/logo.png" alt="Novelty Labels" width={136} height={34} className="h-[34px] w-auto self-start" priority />
      <div className="flex flex-1 flex-col justify-center py-8">
        <p className="font-display text-[13px] font-semibold uppercase tracking-[.16em] text-brand">Visitor check-in</p>
        <h1 className="h-display my-3 text-[38px] leading-[1.05]">Welcome to<br />Novelty Labels.</h1>
        <p className="text-[15.5px] leading-relaxed text-ink-2">Takes about a minute. Your host is told as soon as you&apos;re in.</p>
      </div>
      {/* ponytail: "I have an invite" tile arrives with the invites slice. */}
      <div className="flex flex-col gap-2.5">
        <Tile primary icon={<User />} title="Check in" sub="Tell us who you're here to see" onClick={onWalkIn} />
        <Tile icon={<LogOut />} title="I'm leaving" sub="Sign out of your visit" onClick={onLeave} />
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

function HostStep({ host, setHost, onNext }: { host: Host | null; setHost: (h: Host) => void; onNext: () => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Host[]>([]);
  useEffect(() => {
    if (!q.trim()) return;
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("kiosk_search_hosts", { q });
      setHits((data as Host[]) ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);
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

function LeaveStep({ onLeft }: { onLeft: () => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<OpenVisit[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (q.trim().length < 3) return;
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("kiosk_find_open_visits", { q });
      setHits((data as OpenVisit[]) ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const shown = q.trim().length >= 3 ? hits : [];

  async function signOut(id: string) {
    const { data, error } = await supabase.rpc("kiosk_sign_out", { p_visit_id: id });
    if (error || !data) return setError("We couldn't sign you out. Please ask at reception.");
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

function Finished({ title, lead, onDone, children }: { title: string; lead: string; onDone: () => void; children?: ReactNode }) {
  return (
    <>
      <div className="flex flex-1 flex-col justify-center">
        <span className="mb-5 grid size-[84px] place-items-center rounded-full bg-tint text-brand"><Check className="size-10" strokeWidth={2.5} /></span>
        <h1 className="h-display mb-3 text-[38px] leading-[1.05]">{title}</h1>
        <p className="text-[15.5px] leading-relaxed text-ink-2">{lead}</p>
        {children}
      </div>
      <button className="btn-ghost w-full" onClick={onDone}>Done</button>
      <p className="mt-2.5 text-center text-[13px] text-muted">Back to the start in a few seconds</p>
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

function Row({ k, v }: { k: string; v: string }) {
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
