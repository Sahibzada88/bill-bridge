import { NextResponse } from "next/server";
import { z } from "zod";
import { locationState } from "@/lib/location-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDbFile, isDbPath, signedStorageUrl } from "@/lib/file-store";
import { getSession } from "@/lib/auth";
import { canOpenOriginal, loadDocument, PUBLIC_LIFECYCLES } from "@/lib/documents";
import { getClientIpHash, getUserAgent } from "@/lib/security/ip";
import { rateLimitByIp, rateLimitByUser } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "private, no-store" };
const ORIGINAL_TTL = 60;   // seconds
const PREVIEW_TTL = 300;

/**
 * GET /api/documents/:id/signed?type=original|preview
 * Authorizes, logs the access, then either streams the file (database backend) or 302-redirects to a
 * short-lived signed URL (storage backend). Files are private: this route is the ONLY way to obtain one.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const type = new URL(req.url).searchParams.get("type") === "original" ? "original" : "preview";
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });

  const session = await getSession();
  const blocked = session ? (await locationState(session.profile.role)).blocking : false;
  if (!(await rateLimitByIp("doc-sign", 120, 600)).ok) return NextResponse.json({ error: "rate" }, { status: 429, headers: NO_STORE });
  if (session && !(await rateLimitByUser("doc-sign", session.userId, type === "original" ? 40 : 200, 600)).ok) {
    return NextResponse.json({ error: "rate" }, { status: 429, headers: NO_STORE });
  }

  const doc = await loadDocument(id);
  // Same response for "missing" and "forbidden": no existence oracle for document ids.
  const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  if (!doc || doc.status !== "active" || !doc.requests) return notFound();

  let path: string;
  let ttl: number;
  if (type === "original") {
    if (!session || blocked || !(await canOpenOriginal(session, doc))) return notFound();
    path = doc.storage_path; ttl = ORIGINAL_TTL;
  } else {
    if (doc.kind !== "bill" || !doc.preview_path) return notFound();
    const isOwner = !!session && doc.requests.requester_id === session.userId;
    const isAdmin = !!session && session.profile.role === "admin" && session.aal === "aal2";
    if (!isOwner && !isAdmin && !PUBLIC_LIFECYCLES.includes(doc.requests.lifecycle)) return notFound();
    path = doc.preview_path; ttl = PREVIEW_TTL;
  }

  // Resolve the file first, so we never log an access for a file that cannot be served.
  const dbFile = isDbPath(path) ? await getDbFile(path) : null;
  const signedUrl = isDbPath(path) ? null : await signedStorageUrl(path, ttl);
  if (!dbFile && !signedUrl) return notFound();

  const admin = createAdminClient();

  // Access log: every ORIGINAL access, and previews opened by signed-in users. Failure to log blocks originals.
  if (type === "original" || session) {
    const { error: logErr } = await admin.from("document_access_logs").insert({
      document_id: doc.id, request_id: doc.request_id, accessor_id: session?.userId ?? null, access_type: type,
      ip_hash: await getClientIpHash(), user_agent: await getUserAgent(),
    });
    if (logErr && type === "original") return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  }
  if (dbFile) {
    // Files kept in the database are streamed by this route (it already authorized + logged the request).
    const ext = dbFile.mime === "application/pdf" ? "pdf" : dbFile.mime === "image/png" ? "png" : "jpg";
    return new Response(new Uint8Array(dbFile.bytes), {
      status: 200,
      headers: {
        "Content-Type": dbFile.mime,
        "Content-Length": String(dbFile.bytes.length),
        "Content-Disposition": `inline; filename="document.${ext}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  }
  return NextResponse.redirect(signedUrl!, { status: 302, headers: NO_STORE });
}
