"use client";

import { useActionState } from "react";
import { createInvite } from "./actions";

export function InviteForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState(createInvite, null);
  return (
    <div className="flex flex-col gap-3 p-4">
      <form action={action} className="grid gap-3 sm:grid-cols-2">
        <label><span className="label">Visitor name</span><input name="visitor_name" required maxLength={120} className="input" /></label>
        <label><span className="label">Their email <span className="font-normal text-muted">optional, we send the code</span></span><input name="visitor_email" type="email" className="input" /></label>
        <label><span className="label">Company</span><input name="visitor_company" maxLength={120} className="input" placeholder="Optional" /></label>
        <label><span className="label">Date</span><input name="visit_date" type="date" min={today} defaultValue={today} required className="input" /></label>
        <label>
          <span className="label">Purpose</span>
          <select name="purpose" defaultValue="Meeting" className="input">
            {["Meeting", "Interview", "Delivery", "Contractor", "Other"].map((p) => <option key={p}>{p}</option>)}
          </select>
        </label>
        <label><span className="label">Coming with them <span className="font-normal text-muted">one name per line</span></span>
          <textarea name="guests" rows={2} className="input h-auto min-h-[52px] py-3" />
        </label>
        <button className="btn sm:col-span-2" disabled={pending}>{pending ? "Creating…" : "Create invite"}</button>
      </form>
      {state?.error && <p role="alert" className="text-sm font-medium text-danger">{state.error}</p>}
      {state?.code && (
        <div role="status" className="flex flex-wrap items-center gap-4 rounded-xl bg-tint p-3 text-[14px]">
          {state.qrSvg && (
            // Generated on our server from our own link, so the markup is trusted.
            <span className="w-28 shrink-0 rounded-lg bg-white p-1.5 [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: state.qrSvg }} />
          )}
          <p className="min-w-0 flex-1">
          Invite code <b className="font-display text-xl tracking-[.2em] text-brand">{state.code}</b>
          <span className="block text-[12.5px] text-ink-2">
            {state.emailed ? "We've emailed it to them, with a check-in link."
              : state.emailError ? `Couldn't email it (${state.emailError}). Share the code with them yourself.`
              : "Share this code with them. They enter it at the desk or on their phone."}
            {" "}Screenshot the QR to send it on WhatsApp; the desk tablet can scan it.
          </span>
          </p>
        </div>
      )}
    </div>
  );
}
