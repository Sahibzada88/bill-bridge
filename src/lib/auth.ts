import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile, Role } from "@/types";

export interface SessionInfo {
  userId: string;
  email: string;
  emailConfirmed: boolean;
  profile: Profile;
  aal: "aal1" | "aal2";
}

/** Verified session (getUser validates the JWT with the Auth server). Cached per request. */
export const getSession = cache(async (): Promise<SessionInfo | null> => {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) return null;
  let aal: "aal1" | "aal2" = "aal1";
  try {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (data?.currentLevel === "aal2") aal = "aal2";
  } catch { /* leave aal1 */ }
  return { userId: user.id, email: user.email ?? "", emailConfirmed: !!user.email_confirmed_at, profile: profile as Profile, aal };
});

export async function requireSession(nextPath?: string): Promise<SessionInfo> {
  const s = await getSession();
  if (!s) redirect(`/login${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`);
  if (s.profile.is_suspended) redirect("/login?error=suspended");
  return s;
}

export async function requireRole(role: Exclude<Role, "admin">): Promise<SessionInfo> {
  const s = await requireSession();
  if (s.profile.role !== role) redirect("/dashboard");
  return s;
}

let mfaSettingCache: { v: boolean; at: number } | null = null;
export async function adminMfaRequired(): Promise<boolean> {
  if (mfaSettingCache && Date.now() - mfaSettingCache.at < 30_000) return mfaSettingCache.v;
  const admin = createAdminClient();
  const { data } = await admin.from("app_settings").select("value").eq("key", "require_admin_mfa").maybeSingle();
  const v = (data?.value ?? "true") === "true";
  mfaSettingCache = { v, at: Date.now() };
  return v;
}

/** Admin pages require role=admin AND (when enabled) a TOTP-verified session (aal2). */
export async function requireAdmin(opts: { allowAal1?: boolean } = {}): Promise<SessionInfo> {
  const s = await requireSession("/dashboard/admin");
  if (s.profile.role !== "admin") redirect("/dashboard");
  if (!opts.allowAal1 && s.aal !== "aal2" && (await adminMfaRequired())) redirect("/dashboard/admin/mfa");
  return s;
}
