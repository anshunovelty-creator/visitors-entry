"use client";

import { useActionState } from "react";
import Image from "next/image";
import { signIn } from "./actions";

export default function LoginPage() {
  const [error, action, pending] = useActionState(signIn, null);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center p-6">
      <Image src="/logo.png" alt="Novelty Labels" width={136} height={34} className="mb-8 h-[34px] w-auto self-start" />
      <h1 className="h-display mb-2 text-[32px]">Staff sign in</h1>
      <form action={action} className="mt-4 flex flex-col gap-4">
        <label>
          <span className="label">Work email</span>
          <input name="email" type="email" className="input" autoComplete="email" required />
        </label>
        <label>
          <span className="label">Password</span>
          <input name="password" type="password" className="input" autoComplete="current-password" required />
        </label>
        {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
        <button className="btn" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      </form>
      <p className="mt-6 text-[13.5px] text-muted">Forgot your password? Ask an admin to reset it.</p>
    </main>
  );
}
