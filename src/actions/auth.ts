"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";
import { getClientIp } from "@/lib/security/ip";
import { rateLimit, rateLimitByIp } from "@/lib/security/rate-limit";
import { captchaTokenForSupabase, verifyCaptcha } from "@/lib/security/turnstile";
import { logSecurityEvent } from "@/lib/security/events";
import { loginSchema, registerSchema, resetRequestSchema, newPasswordSchema } from "@/lib/validation";
import { fail, zodFail } from "@/lib/action-utils";
import { publicEnv } from "@/lib/env";
import { safeRedirectPath } from "@/lib/utils";
import { sha256Hex } from "@/lib/security/hash";
import type { ActionResult } from "@/types";

export async function registerAction(input: unknown, captchaToken: string | null): Promise<ActionResult> {
  const { t, locale } = await getT();
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return zodFail(t, parsed.error);

  if (!(await rateLimitByIp("register", 5, 3600)).ok) return fail(t, "rate", { error: t("auth.err.rate") });
  const captcha = await verifyCaptcha(captchaToken, await getClientIp());
  if (!captcha.ok) return fail(t, "captcha", { error: t("auth.err.captcha") });

  const { fullName, email, password, role } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email, password,
    options: {
      captchaToken: captchaTokenForSupabase(captchaToken),
      emailRedirectTo: `${publicEnv.siteUrl}/auth/callback?next=/dashboard`,
      // user_metadata is user-controlled. The DB trigger only honours 'donor'; it can never yield 'admin'.
      data: { full_name: fullName, role, locale },
    },
  });
  // Same response whether or not the email exists (no account enumeration).
  if (error && !/already|registered|exists/i.test(error.message)) {
    if (/password/i.test(error.message)) return fail(t, "weak", { error: t("auth.err.weak") });
    console.error("[signup]", error.message);
    return fail(t, "unknown", { error: t("auth.err.exists") });
  }
  return { ok: true, message: t("auth.registered") };
}

export async function loginAction(input: unknown, captchaToken: string | null, next?: string): Promise<ActionResult> {
  const { t } = await getT();
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return zodFail(t, parsed.error);
  const { email, password } = parsed.data;

  // Per-IP and per-account throttles stop brute force and credential stuffing.
  if (!(await rateLimitByIp("login", 20, 900)).ok) return fail(t, "rate", { error: t("auth.err.rate") });
  const emailKey = sha256Hex(email).slice(0, 24);
  if (!(await rateLimit(`login:acct:${emailKey}`, 8, 900)).ok) return fail(t, "rate", { error: t("auth.err.rate") });

  const captcha = await verifyCaptcha(captchaToken, await getClientIp());
  if (!captcha.ok) return fail(t, "captcha", { error: t("auth.err.captcha") });

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken: captchaTokenForSupabase(captchaToken) } });
  if (error || !data.user) {
    await logSecurityEvent(null, "login_failed", { email_hash: emailKey });
    if (error && /confirm|verified/i.test(error.message)) return fail(t, "unverified", { error: t("auth.err.unverified") });
    return fail(t, "invalid", { error: t("auth.err.invalid") });
  }
  const { data: profile } = await supabase.from("profiles").select("is_suspended").eq("id", data.user.id).single();
  if (profile?.is_suspended) {
    await supabase.auth.signOut();
    return fail(t, "suspended", { error: t("auth.err.suspended") });
  }
  await logSecurityEvent(data.user.id, "login_success", {});
  revalidatePath("/", "layout");
  redirect(safeRedirectPath(next));
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

export async function requestPasswordResetAction(input: unknown, captchaToken: string | null): Promise<ActionResult> {
  const { t } = await getT();
  const parsed = resetRequestSchema.safeParse(input);
  if (!parsed.success) return zodFail(t, parsed.error);
  if (!(await rateLimitByIp("reset", 5, 3600)).ok) return fail(t, "rate", { error: t("auth.err.rate") });
  const captcha = await verifyCaptcha(captchaToken, await getClientIp());
  if (!captcha.ok) return fail(t, "captcha", { error: t("auth.err.captcha") });

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, { captchaToken: captchaTokenForSupabase(captchaToken), redirectTo: `${publicEnv.siteUrl}/auth/callback?next=/reset-password` });
  // Always the same message: never reveal whether the account exists.
  return { ok: true, message: t("auth.reset.sent") };
}

export async function updatePasswordAction(input: unknown): Promise<ActionResult> {
  const { t } = await getT();
  const parsed = newPasswordSchema.safeParse(input);
  if (!parsed.success) return zodFail(t, parsed.error);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(t, "not_authenticated");
  if (!(await rateLimit(`pwd:${user.id}`, 5, 3600)).ok) return fail(t, "rate");
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return fail(t, "weak", { error: t("auth.err.weak") });
  await logSecurityEvent(user.id, "password_changed", {}, true);
  return { ok: true, message: t("st.passwordChanged") };
}
