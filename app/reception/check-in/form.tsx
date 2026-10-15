"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toJpeg } from "@/app/kiosk/kiosk-flow";
import { checkInWalkIn } from "../actions";

type Host = { id: string; full_name: string; department: string | null };

export function WalkInForm({ hosts }: { hosts: Host[] }) {
  const [photo, setPhoto] = useState<Blob | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const url = useMemo(() => (photo ? URL.createObjectURL(photo) : ""), [photo]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

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
    <form action={action} className="grid gap-3 p-4 sm:grid-cols-2">
      <label><span className="label">Visitor name</span><input name="visitor_name" required maxLength={120} className="input" autoFocus /></label>
      <label><span className="label">Company</span><input name="company" maxLength={120} className="input" placeholder="Optional" /></label>
      <label><span className="label">Mobile</span><input name="mobile" type="tel" maxLength={30} className="input" placeholder="Optional" /></label>
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

      {error && <p role="alert" className="text-sm font-medium text-danger sm:col-span-2">{error}</p>}
      <button className="btn sm:col-span-2" disabled={pending}>{pending ? "Checking in…" : "Check in"}</button>
    </form>
  );
}
