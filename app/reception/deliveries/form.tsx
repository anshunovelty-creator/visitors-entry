"use client";

import { useActionState, useEffect, useRef } from "react";
import { logDelivery } from "./actions";

type Staff = { id: string; full_name: string; department: string | null };

export function LogDeliveryForm({ staff }: { staff: Staff[] }) {
  const form = useRef<HTMLFormElement>(null);
  const [error, action, pending] = useActionState(logDelivery, null);
  // Clear the form after a successful save, ready for the next parcel.
  const was = useRef(pending);
  useEffect(() => {
    if (was.current && !pending && error === null) form.current?.reset();
    was.current = pending;
  }, [pending, error]);

  return (
    <form ref={form} action={action} className="grid gap-3 p-4 sm:grid-cols-2">
      <label>
        <span className="label">For</span>
        <select name="recipient_id" required defaultValue="" className="input">
          <option value="" disabled>Pick a person</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}{s.department ? ` · ${s.department}` : ""}</option>)}
        </select>
      </label>
      <label><span className="label">Courier</span><input name="carrier" maxLength={60} className="input" placeholder="e.g. Blue Dart, Amazon" list="carriers" /></label>
      <datalist id="carriers">
        {["Blue Dart", "DTDC", "Delhivery", "India Post", "Amazon", "Flipkart", "DHL", "FedEx", "Hand delivered"].map((c) => <option key={c} value={c} />)}
      </datalist>
      <label><span className="label">What is it</span><input name="description" maxLength={200} className="input" placeholder="e.g. 2 boxes, envelope" /></label>
      <label><span className="label">Tracking number</span><input name="tracking" maxLength={60} className="input" placeholder="Optional" /></label>
      {error && <p role="alert" className="text-sm font-medium text-danger sm:col-span-2">{error}</p>}
      <button className="btn sm:col-span-2" disabled={pending}>{pending ? "Saving…" : "Log delivery and tell them"}</button>
    </form>
  );
}
