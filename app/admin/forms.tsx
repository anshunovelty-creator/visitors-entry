"use client";

import { useActionState } from "react";
import { addDevice, addStaff, newDeviceCode, resetPassword } from "./actions";

export function AddStaffForm() {
  const [error, action, pending] = useActionState(addStaff, null);
  return (
    <form action={action} className="grid gap-3 p-4 sm:grid-cols-2">
      <label><span className="label">Full name</span><input name="full_name" className="input" required /></label>
      <label><span className="label">Work email</span><input name="email" type="email" className="input" required /></label>
      <label><span className="label">Department</span><input name="department" className="input" placeholder="Optional" /></label>
      <label>
        <span className="label">Role</span>
        <select name="role" defaultValue="host" className="input">
          <option value="host">Host</option>
          <option value="reception">Reception</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      <label className="sm:col-span-2">
        <span className="label">Starting password</span>
        <input name="password" type="text" minLength={8} autoComplete="off" className="input" required />
        <span className="mt-1 block text-[12.5px] text-muted">At least 8 characters. Share it with them in person.</span>
      </label>
      {error && <p role="alert" className="text-sm font-medium text-danger sm:col-span-2">{error}</p>}
      <button className="btn sm:col-span-2" disabled={pending}>{pending ? "Adding…" : "Add staff member"}</button>
    </form>
  );
}

export function ResetPasswordForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(resetPassword.bind(null, id), null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input name="password" type="text" minLength={8} autoComplete="off" placeholder="New password"
        aria-label="New password" className="input h-11 w-44" required />
      <button className="btn-sm border-[1.5px] border-line-input bg-surface" disabled={pending}>Set password</button>
      {state && (
        <span role="status" className={`text-[13px] font-medium ${state === "saved" ? "text-brand" : "text-danger"}`}>
          {state === "saved" ? "Saved" : state}
        </span>
      )}
    </form>
  );
}

function Code({ code }: { code: string }) {
  return (
    <p role="status" className="rounded-xl bg-tint p-3 text-[14px]">
      Enrollment code <b className="font-display text-xl tracking-[.2em] text-brand">{code}</b>
      <span className="block text-[12.5px] text-ink-2">Open /kiosk/enroll on the device. Works once, for 10 minutes.</span>
    </p>
  );
}

export function AddDeviceForm() {
  const [state, action, pending] = useActionState(addDevice, null);
  return (
    <div className="flex flex-col gap-3 p-4">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <label className="min-w-48 flex-1"><span className="label">Device name</span><input name="name" className="input" placeholder="Front desk" required /></label>
        <button className="btn" disabled={pending}>{pending ? "Adding…" : "Add device"}</button>
      </form>
      {state?.error && <p role="alert" className="text-sm font-medium text-danger">{state.error}</p>}
      {state?.code && <Code code={state.code} />}
    </div>
  );
}

export function DeviceCodeButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(newDeviceCode.bind(null, id), null);
  return (
    <div className="flex flex-col gap-2">
      <form action={action}>
        <button className="btn-sm border-[1.5px] border-line-input bg-surface" disabled={pending}>New code</button>
      </form>
      {state?.error && <p role="alert" className="text-sm font-medium text-danger">{state.error}</p>}
      {state?.code && <Code code={state.code} />}
    </div>
  );
}
