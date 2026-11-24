import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { assertPublicEnv, publicEnv } from "@/lib/env";

/** Supabase client bound to the current user's session (RLS applies). */
export async function createClient() {
  assertPublicEnv();
  const cookieStore = await cookies();
  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: the proxy refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}
