import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, signedInUser } from "@/lib/supabase/server";
import { PasswordForm } from "./form";

export default function AccountPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 p-6">
      <Image src="/logo.png" alt="Novelty Labels" width={136} height={34} className="h-[34px] w-auto self-start" />
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Account />
      </Suspense>
    </main>
  );
}

// Not via getStaff: that sends anyone who must change their password here, which would loop.
async function Account() {
  const supabase = await createClient();
  const user = await signedInUser(supabase);
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("staff").select("full_name, must_change_password").eq("id", user.id).eq("active", true).maybeSingle();
  if (!me) redirect("/login");
  return (
    <>
      <h1 className="h-display text-[30px] leading-tight">{me.must_change_password ? "Choose your own password" : "Change your password"}</h1>
      <p className="text-[15.5px] text-ink-2">
        {me.must_change_password
          ? `Welcome, ${me.full_name.split(" ")[0]}. The password you were given was set by an admin; replace it with one only you know.`
          : "At least 8 characters."}
      </p>
      <PasswordForm />
      {!me.must_change_password && <Link href="/reception" className="text-center text-[14px] font-semibold text-brand">Back</Link>}
    </>
  );
}
