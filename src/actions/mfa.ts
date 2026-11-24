"use server";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { logSecurityEvent } from "@/lib/security/events";

/** Called by the MFA UI after a successful TOTP verification. Only logs if the session truly is aal2. */
export async function recordMfaEventAction(kind: "mfa_enrolled" | "mfa_verified"): Promise<void> {
  const s = await getSession();
  if (!s || s.profile.role !== "admin") return;
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (data?.currentLevel !== "aal2") return;
  await logSecurityEvent(s.userId, kind, {}, kind === "mfa_enrolled");
}
