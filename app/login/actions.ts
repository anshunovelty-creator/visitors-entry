"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// No public sign-up: admins create accounts on /admin.
export async function signIn(_prev: string | null, form: FormData): Promise<string | null> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email.includes("@") || !password) return "Enter your work email and password.";
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return error.status === 400 ? "Wrong email or password." : "Could not sign in. Try again in a minute.";
  redirect("/reception");
}
