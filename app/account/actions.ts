"use server";

import { redirect } from "next/navigation";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { createAdminClient, createClient } from "@/lib/supabase/server";

const MIN_PASSWORD = 8;

export async function changePassword(_prev: string | null, form: FormData): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  if (next.length < MIN_PASSWORD) return `The new password needs at least ${MIN_PASSWORD} characters.`;
  if (next !== String(form.get("confirm") ?? "")) return "The two new passwords don't match.";
  if (next === current) return "Choose a different password from the current one.";

  // Check the current password on a throwaway client, so a wrong guess can't touch this session.
  const check = createPlainClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if ((await check.auth.signInWithPassword({ email: user.email, password: current })).error) return "Your current password isn't right.";
  await check.auth.signOut({ scope: "local" }); // just that check session, not this one

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return error.message;
  // Staff can't edit their own row (RLS: admins only), so the server clears the flag.
  await createAdminClient().from("staff").update({ must_change_password: false }).eq("id", user.id);
  redirect("/reception");
}
