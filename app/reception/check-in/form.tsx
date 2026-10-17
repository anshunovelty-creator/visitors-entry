"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toJpeg, type Returning } from "@/app/kiosk/kiosk-flow";
import { checkInWalkIn } from "../actions";

type Host = { id: string; full_name: string; department: string | null };

export function WalkInForm({ hosts, agreement }: { hosts: Host[]; agreement: string }) {
  const [photo, setPhoto] = useState<Blob | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const url = useMemo(() => (photo ? URL.createObjectURL(photo) : ""), [photo]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  // A full mobile number fills in what's still empty from their last visit, host included.
  const form = useRef<HTMLFormElement>(null);
  const looked = useRef("");
  const [welcome, setWelcome] = useState("");
  async function onMobile(m: string) {
    const key = m.replace(/\D/g, "").slice(-10);
    if (key.length < 10 || key === looked.current) return;
    looked.current = key;
    const { data: r } = await createClient().rpc("returning_visitor", { p_mobile: m }).maybeSingle<Returning>();
    if (!r || !form.current) return;
    const fill = (name: string, value: string | null) => {
      const el = form.current?.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
      if (el && !el.value && value) el.value = value;
    };
    fill("visitor_name", r.visitor_name);
    fill("company", r.company);
    fill("host_id", r.host_id);
    setWelcome(`Returning visitor: ${r.visits} earlier visit${r.visits === 1 ? "" : "s"}${r.host_name ? `, last with ${r.host_name}` : ""}.`);
  }

  const [error, action, pending] = useActionState(async (_prev: string, form: FormData) => {
    if (photo) {
      const path = `staff/${crypto.randomUUID()}.jpg`;
      const up = await createClient().storage.from("visit-photos").upload(path, photo, { contentType: "image/jpeg" });
      if (up.error) return "Couldn't save the photo. Try again, or remove it.";
      form.set("photo_path", path);
    }
    return checkInWalkIn(form);
  }, "");

  return (
    <form ref={form} action={action} className="grid gap-3 p-4 sm:grid-cols-2">
      {/* First, so a returning visitor's details fill in. */}
      <label><span className="label">Mobile</span><input name="mobile" type="tel" maxLength={30} className="input" placeholder="Optional" autoFocus onChange={(e) => onMobile(e.target.value)} /></label>
      <label><span className="label">Visitor name</span><input name="visitor_name" required maxLength={120} className="input" /></label>
      {welcome && <p role="status" className="text-[13.5px] font-semibold text-brand sm:col-span-2">{welcome}</p>}
      <label><span className="label">Company</span><input name="company" maxLength={120} className="input" placeholder="Optional" /></label>
      <label>
        <span className="label">Purpose</span>
        <select name="purpose" defaultValue="Meeting" className="input">
          {["Meeting", "Interview", "Delivery", "Contractor", "Other"].map((p) => <option key={p}>{p}</option>)}
        </select>
      </label>
      <label>
        <span className="label">Visiting</span>
        <select name="host_id" defaultValue="" className="input">
          <option value="">Reception (no host)</option>
          {hosts.map((h) => <option key={h.id} value={h.id}>{h.full_name}{h.department ? ` · ${h.department}` : ""}</option>)}
        </select>
      </label>
      <label><span className="label">Vehicle number</span><input name="vehicle" maxLength={20} className="input uppercase" placeholder="Optional" /></label>
      <label><span className="label">Carrying in</span><input name="carrying" maxLength={200} className="input" placeholder="Optional: laptop, tools…" /></label>
      <label><span className="label">Coming with them <span className="font-normal text-muted">one name per line</span></span>
        <textarea name="guests" rows={2} className="input h-auto min-h-[52px] py-3" />
      </label>

      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="button" onClick={() => input.current?.click()} aria-label={photo ? "Retake photo" : "Take photo"}
          className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[#16231D] text-white">
          {url
            // eslint-disable-next-line @next/next/no-img-element -- local blob preview, nothing to optimise
            ? <img src={url} alt="Visitor photo" className="absolute inset-0 size-full object-cover" />
            : <Camera className="size-7" />}
        </button>
        <span className="text-[13.5px] text-ink-2">
          Photo <span className="text-muted">optional</span>
          {photo && <button type="button" className="btn-sm ml-2 text-danger" onClick={() => setPhoto(null)}>Remove</button>}
        </span>
        <input ref={input} type="file" accept="image/*" capture="user" hidden
          onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPhoto(await toJpeg(f)); e.target.value = ""; }} />
      </div>

      {agreement && (
        <details className="sm:col-span-2">
          <summary className="cursor-pointer text-[13.5px] font-semibold text-brand">Visitor agreement</summary>
          <p className="mt-2 max-h-48 overflow-y-auto rounded-xl bg-tint/50 p-3 text-[13.5px] whitespace-pre-wrap">{agreement}</p>
        </details>
      )}
      {agreement && (
        <label className="flex min-h-11 items-center gap-2.5 text-[14px] sm:col-span-2">
          <input type="checkbox" name="agreed" className="size-5 accent-[var(--color-brand)]" />
          The visitor has read and accepted the agreement
        </label>
      )}
      {error && <p role="alert" className="text-sm font-medium text-danger sm:col-span-2">{error}</p>}
      <button className="btn sm:col-span-2" disabled={pending}>{pending ? "Checking in…" : "Check in"}</button>
    </form>
  );
}
