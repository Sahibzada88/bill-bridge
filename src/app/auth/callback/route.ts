import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/utils";

/**
 * Handles Supabase email links (signup confirmation, password recovery, magic links).
 * Supports both PKCE (?code=) and token-hash (?token_hash=&type=) flows.
 * `next` is validated to a same-site relative path (no open redirect).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeRedirectPath(url.searchParams.get("next"), "/dashboard");
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const supabase = await createClient();

  let ok = false;
  if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && type) ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;

  const dest = ok ? (type === "recovery" ? "/reset-password" : next) : "/login?error=callback";
  return NextResponse.redirect(new URL(dest, url.origin));
}
