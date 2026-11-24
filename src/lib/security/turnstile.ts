import "server-only";
import { isProd, serverEnv } from "@/lib/env";

export interface CaptchaResult { ok: boolean; reason?: "missing_token" | "failed" | "not_configured" | "unavailable"; skipped?: boolean }

/** Token to forward to Supabase Auth (only when Supabase is the verifier). */
export function captchaTokenForSupabase(token: string | null | undefined): string | undefined {
  return serverEnv().SUPABASE_AUTH_CAPTCHA === "true" && token ? token : undefined;
}

/**
 * Cloudflare Turnstile verification (free). Without a secret key:
 *  - development: skipped (clearly flagged)
 *  - production: REJECTED unless ALLOW_MISSING_CAPTCHA=true is set explicitly.
 */
export async function verifyCaptcha(token: string | null | undefined, ip?: string): Promise<CaptchaResult> {
  const env = serverEnv();
  // Supabase Auth verifies the token itself (single-use tokens must not be verified twice).
  if (env.SUPABASE_AUTH_CAPTCHA === "true") return token ? { ok: true, skipped: true } : { ok: false, reason: "missing_token" };
  if (!env.TURNSTILE_SECRET_KEY) {
    if (!isProd || env.ALLOW_MISSING_CAPTCHA === "true") return { ok: true, skipped: true };
    return { ok: false, reason: "not_configured" };
  }
  if (!token) return { ok: false, reason: "missing_token" };
  try {
    const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
    if (ip && ip !== "unknown") body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", body, signal: AbortSignal.timeout(5000), cache: "no-store",
    });
    if (!res.ok) return { ok: false, reason: "unavailable" };
    const json = (await res.json()) as { success?: boolean };
    return json.success ? { ok: true } : { ok: false, reason: "failed" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
