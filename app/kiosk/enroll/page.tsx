"use client";

import { useActionState } from "react";
import { enroll } from "./actions";

export default function EnrollPage() {
  const [error, action, pending] = useActionState(enroll, null);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center p-6">
      <p className="font-display text-[13px] font-semibold uppercase tracking-[.16em] text-brand">Desk device</p>
      <h1 className="h-display my-3 text-[32px]">Set up this device</h1>
      <p className="text-[15.5px] text-ink-2">Ask an admin for an enrollment code. It works once, for 10 minutes.</p>
      <form action={action} className="mt-6 flex flex-col gap-4">
        <input name="code" className="input text-center font-display text-2xl tracking-[.3em] uppercase" maxLength={9}
          autoComplete="off" autoCapitalize="characters" aria-label="Enrollment code" placeholder="XXXX-XXXX" required />
        {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
        <button className="btn" disabled={pending}>{pending ? "Checking…" : "Enroll device"}</button>
      </form>
    </main>
  );
}
