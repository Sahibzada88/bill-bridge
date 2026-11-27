import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security/csrf";
import { rateLimitByUser } from "@/lib/security/rate-limit";
import { getClientIpHash, getUserAgent } from "@/lib/security/ip";
import { locationPayloadSchema, parseIpGeo } from "@/lib/location";
import { clearLocationPending, isBlockingFor, isLocationPending, locationPolicy } from "@/lib/location-server";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "private, no-store" };
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

/**
 * POST /api/location — called once per login by the location screen.
 * Only accepted while the "pending" cookie set at login is present, so it cannot be used to spam rows.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return reply({ ok: false, code: "forbidden" }, 403);
  const session = await getSession();
  if (!session || session.profile.is_suspended) return reply({ ok: false, code: "forbidden" }, 401);
  if (locationPolicy() === "off" || !(await isLocationPending())) return reply({ ok: true, done: true });
  if (!(await rateLimitByUser("location", session.userId, 12, 3600)).ok) return reply({ ok: false, code: "rate" }, 429);

  let body: unknown;
  try { body = await req.json(); } catch { return reply({ ok: false, code: "validation" }, 400); }
  const parsed = locationPayloadSchema.safeParse(body);
  if (!parsed.success) return reply({ ok: false, code: "validation" }, 400);
  const p = parsed.data;

  const blocking = isBlockingFor(session.profile.role);
  if (p.status === "dismissed") {
    if (blocking) return reply({ ok: false, code: "location_required" }, 403); // cannot skip when required
    await clearLocationPending();
    return reply({ ok: true, done: true });
  }

  const geo = parseIpGeo(await headers());
  const admin = createAdminClient();
  const row = {
    user_id: session.userId, ip_country: geo.country, ip_region: geo.region, ip_city: geo.city,
    ip_hash: await getClientIpHash(), user_agent: await getUserAgent(),
  };
  const { error } = p.status === "granted"
    ? await admin.from("login_locations").insert({ ...row, source: "gps", latitude: p.latitude, longitude: p.longitude, accuracy_m: p.accuracy ?? null })
    : await admin.from("login_locations").insert({ ...row, source: p.status });
  if (error) { console.error("[location] insert failed", error.message); return reply({ ok: false, code: "unknown" }, 500); }

  // Granted -> done. Refused/unavailable -> still blocked when the policy is "required" (non-admins).
  const done = p.status === "granted" || !blocking;
  if (done) await clearLocationPending();
  return reply({ ok: true, done });
}
