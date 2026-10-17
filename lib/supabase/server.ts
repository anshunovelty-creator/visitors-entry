import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createPlainClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { connection } from "next/server";

export async function createClient() {
  // The session check uses Date.now(), which runtime prefetching rejects; the session is per-request anyway.
  await connection();
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component; the proxy refreshes the session instead.
          }
        },
      },
    },
  );
}

// Bypasses RLS. Server-only: device enrollment.
export function createAdminClient() {
  return createPlainClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

// The signed-in user, verified locally against the project's JWT signing keys: no round trip to
// Supabase Auth, which getUser() makes on every call. Deactivated staff are still caught by the
// staff lookups that follow (active = true).
export async function signedInUser(supabase: Pick<SupabaseClient, "auth">) {
  const { data } = await supabase.auth.getClaims();
  return data ? { id: data.claims.sub } : null;
}
