"use client";

import { useActionState } from "react";
import { changePassword } from "./actions";

export function PasswordForm() {
  const [error, action, pending] = useActionState(changePassword, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <label><span className="label">Current password</span><input name="current" type="password" autoComplete="current-password" required className="input" /></label>
      <label><span className="label">New password</span><input name="next" type="password" autoComplete="new-password" minLength={8} required className="input" /></label>
      <label><span className="label">New password again</span><input name="confirm" type="password" autoComplete="new-password" minLength={8} required className="input" /></label>
      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
      <button className="btn" disabled={pending}>{pending ? "Saving…" : "Change password"}</button>
    </form>
  );
}
