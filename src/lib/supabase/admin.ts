import "server-only";
import { createClient } from "@supabase/supabase-js";
import { assertPublicEnv, publicEnv, serverEnv } from "@/lib/env";

/**
 * Service-role client. BYPASSES RLS. Server-only (the `server-only` import makes the build fail
 * if this is ever pulled into a client bundle). Always authorize the caller BEFORE using it.
 */
export function createAdminClient() {
  assertPublicEnv();
  return createClient(publicEnv.supabaseUrl, serverEnv().SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
