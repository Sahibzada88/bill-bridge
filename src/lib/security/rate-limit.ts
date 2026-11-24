import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientIpHash } from "./ip";
import { isProd } from "@/lib/env";

export interface RateResult { ok: boolean }

/**
 * Postgres-backed fixed-window rate limiter (no Redis needed). Atomic via a single upsert in
 * public.check_rate_limit. Fails CLOSED in production if the limiter itself errors.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateResult> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("check_rate_limit", {
      p_key: key, p_limit: limit, p_window_seconds: windowSeconds,
    });
    if (error) throw error;
    return { ok: data === true };
  } catch (e) {
    console.error("[rate-limit] error", e instanceof Error ? e.message : e);
    return { ok: !isProd };
  }
}

export async function rateLimitByIp(action: string, limit: number, windowSeconds: number): Promise<RateResult> {
  return rateLimit(`ip:${action}:${await getClientIpHash()}`, limit, windowSeconds);
}

export async function rateLimitByUser(action: string, userId: string, limit: number, windowSeconds: number): Promise<RateResult> {
  return rateLimit(`user:${action}:${userId}`, limit, windowSeconds);
}
