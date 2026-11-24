import "server-only";
import { headers } from "next/headers";
import { hashIp, sha256Hex } from "./hash";
import { serverEnv } from "@/lib/env";

/** Best-effort client IP. On Vercel, x-forwarded-for / x-real-ip are set by the platform. */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0] : h.get("x-real-ip") ?? "").trim();
  return ip || "unknown";
}

/** IP_HASH_SALT is optional: when unset a stable salt is derived from the (secret) service-role key. */
export function ipSalt(): string {
  const env = serverEnv();
  return env.IP_HASH_SALT || sha256Hex(`bb-ip-salt:${env.SUPABASE_SERVICE_ROLE_KEY}`);
}

export async function getClientIpHash(): Promise<string> {
  return hashIp(await getClientIp(), ipSalt());
}

export async function getUserAgent(): Promise<string> {
  const h = await headers();
  return (h.get("user-agent") ?? "").slice(0, 300);
}
