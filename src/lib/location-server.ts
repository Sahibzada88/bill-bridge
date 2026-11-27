import "server-only";
import { cookies, headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv, isProd } from "@/lib/env";
import { getClientIpHash, getUserAgent } from "@/lib/security/ip";
import { LOCATION_COOKIE, parseIpGeo, type LocationPolicy } from "@/lib/location";
import type { Role } from "@/types";

export function locationPolicy(): LocationPolicy {
  return serverEnv().LOCATION_POLICY;
}

/** Admins are asked like everyone else but are never locked out (a missing GPS must not lock the last admin out). */
export function isBlockingFor(role: Role, policy: LocationPolicy = locationPolicy()): boolean {
  return policy === "required" && role !== "admin";
}

export async function isLocationPending(): Promise<boolean> {
  return (await cookies()).get(LOCATION_COOKIE)?.value === "1";
}

export async function setLocationPending(): Promise<void> {
  (await cookies()).set(LOCATION_COOKIE, "1", { httpOnly: true, sameSite: "lax", secure: isProd, path: "/", maxAge: 60 * 60 * 24 });
}
export async function clearLocationPending(): Promise<void> {
  (await cookies()).delete(LOCATION_COOKIE);
}

/** State used by the layout and by actions: is this signed-in user currently blocked until they share location? */
export async function locationState(role: Role) {
  const policy = locationPolicy();
  if (policy === "off") return { pending: false, blocking: false, policy };
  const pending = await isLocationPending();
  return { pending, blocking: pending && isBlockingFor(role, policy), policy };
}

/**
 * Called on every successful login. Records the approximate network location (no permission needed, so it
 * exists even if the user later refuses or fakes GPS) and asks the browser for a precise one.
 * Never throws: a logging problem must not stop someone from logging in.
 */
export async function recordLoginAndRequestLocation(userId: string): Promise<void> {
  if (locationPolicy() === "off") return;
  try {
    const geo = parseIpGeo(await headers());
    await createAdminClient().from("login_locations").insert({
      user_id: userId, source: "ip", latitude: geo.latitude, longitude: geo.longitude,
      ip_country: geo.country, ip_region: geo.region, ip_city: geo.city,
      ip_hash: await getClientIpHash(), user_agent: await getUserAgent(),
    });
  } catch (e) {
    console.error("[location] ip record failed", e instanceof Error ? e.message : e);
  }
  await setLocationPending();
}
