import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { flushEmailOutbox } from "@/lib/email";

export const runtime = "nodejs";

function authorized(req: Request): boolean {
  const secret = serverEnv().CRON_SECRET;
  if (!secret) return false; // disabled unless a secret is configured
  const given = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  const a = Buffer.from(given), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Optional sweeper for expired reservations (also swept lazily on page loads and on every reserve).
 * Call with: Authorization: Bearer $CRON_SECRET from any scheduler you control (or use pg_cron, see docs).
 */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("release_expired_reservations");
  if (error) return NextResponse.json({ error: "failed" }, { status: 500 });
  await admin.rpc("cleanup_rate_limits");
  const mail = await flushEmailOutbox(25);
  return NextResponse.json({ released: data, emails: mail });
}
