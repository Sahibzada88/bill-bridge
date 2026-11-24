import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { newPath, putFile, removeFiles } from "@/lib/file-store";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security/csrf";
import { MAX_FILE_BYTES, FileValidationError, sanitizeDisplayName, validateUpload } from "@/lib/security/files";
import { sanitizePdf } from "@/lib/security/pdf";
import { makeRedactedPreview, sanitizeImage, type RedactionConfig } from "@/lib/security/images";
import { randomId, sha256Hex } from "@/lib/security/hash";
import { rateLimitByIp, rateLimitByUser } from "@/lib/security/rate-limit";
import { logSecurityEvent } from "@/lib/security/events";
import { redactionSchema } from "@/lib/validation";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 30;

const fieldsSchema = z.object({ requestId: z.string().uuid(), kind: z.enum(["bill", "supporting", "receipt"]) });
const err = (code: string, status: number) => NextResponse.json({ ok: false, code }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return err("forbidden", 403);

  const session = await getSession();
  if (!session || session.profile.is_suspended) return err("forbidden", 401);

  if (!(await rateLimitByUser("upload", session.userId, 30, 3600)).ok || !(await rateLimitByIp("upload", 60, 3600)).ok) return err("rate", 429);

  // Reject oversized bodies BEFORE buffering them (Content-Length is advisory, so size is re-checked below).
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_FILE_BYTES + 256 * 1024) return err("file_too_large", 413);

  let form: FormData;
  try { form = await req.formData(); } catch { return err("no_file", 400); }
  const file = form.get("file");
  if (!(file instanceof File)) return err("no_file", 400);
  if (file.size > MAX_FILE_BYTES) return err("file_too_large", 413);

  const fields = fieldsSchema.safeParse({ requestId: form.get("requestId"), kind: form.get("kind") });
  if (!fields.success) return err("forbidden", 400);
  const { requestId, kind } = fields.data;

  const admin = createAdminClient();

  // ---------- Authorization (server-side; the bucket is private and has no client policies) ----------
  const { data: request } = await admin.from("requests").select("id, requester_id, lifecycle").eq("id", requestId).maybeSingle();
  if (!request) return err("forbidden", 403);

  if (kind === "receipt") {
    if (session.profile.role !== "donor") return err("forbidden", 403);
    const { data: res } = await admin.from("reservations").select("id, status, ended_at")
      .eq("request_id", requestId).eq("donor_id", session.userId).order("created_at", { ascending: false }).limit(1);
    const r = res?.[0];
    const recent = !!r && (r.status === "active" || (r.status === "expired" && !!r.ended_at && Date.now() - new Date(r.ended_at).getTime() < 24 * 3600 * 1000));
    if (!recent) return err("forbidden", 403);
  } else {
    if (session.profile.role !== "requester" || request.requester_id !== session.userId) return err("forbidden", 403);
    const allowed = kind === "bill" ? ["draft", "open"] : ["draft", "open", "reserved"];
    if (!allowed.includes(request.lifecycle)) return err("forbidden", 403);
    if (kind === "bill" && request.lifecycle === "open") {
      const { count } = await admin.from("donor_reviews").select("id", { count: "exact", head: true }).eq("request_id", requestId);
      if (count) return err("forbidden", 403); // bills are frozen once a donor has reviewed
    }
    const { count } = await admin.from("documents").select("id", { count: "exact", head: true })
      .eq("request_id", requestId).eq("status", "active").neq("kind", "receipt");
    if ((count ?? 0) >= 8) return err("limit", 400);
  }

  // ---------- Validate + sanitize ----------
  const raw = Buffer.from(await file.arrayBuffer());
  let bytes: Buffer; let mime: "image/jpeg" | "image/png" | "application/pdf"; let ext: "jpg" | "png" | "pdf";
  try {
    const v = await validateUpload(raw, file.type || null);
    mime = v.mime; ext = v.ext;
    if (v.mime === "application/pdf") bytes = (await sanitizePdf(raw)).bytes;
    else bytes = (await sanitizeImage(raw, v.mime)).bytes;
  } catch (e) {
    if (e instanceof FileValidationError) {
      await logSecurityEvent(session.userId, "suspicious_upload_rejected", { code: e.code, kind });
      return err(e.code, 400);
    }
    console.error("[upload] processing error", e instanceof Error ? e.message : e);
    return err("unknown", 500);
  }
  if (bytes.length > MAX_FILE_BYTES) return err("file_too_large", 413);

  // ---------- Duplicate detection (SHA-256 of the sanitized bytes) ----------
  const sha = sha256Hex(bytes);
  const { data: dupes } = await admin.from("documents")
    .select("id, request_id, owner_id, kind, requests!inner(lifecycle)").eq("sha256", sha).eq("status", "active");
  for (const d of (dupes ?? []) as unknown as { id: string; request_id: string; owner_id: string; kind: string; requests: { lifecycle: string } }[]) {
    if (d.request_id === requestId) return err("duplicate_same", 409);
    const stillLive = ["draft", "open", "reserved", "payment_pending", "completed"].includes(d.requests.lifecycle);
    if (d.owner_id !== session.userId || kind === "receipt" || stillLive) {
      await logSecurityEvent(session.userId, "suspicious_duplicate_document", { kind, matched_document: d.id, matched_request: d.request_id });
      return err("duplicate_other", 409);
    }
  }

  // ---------- Store privately under random names ----------
  const base = `${requestId}/${randomId()}`;
  const storagePath = newPath(base, `.${ext}`);
  try { await putFile(storagePath, bytes, mime); }
  catch (e) { console.error("[upload] store", e instanceof Error ? e.message : e); return err("unknown", 500); }

  // Redacted public preview (images only; PDFs cannot be rasterised without native tooling).
  let previewPath: string | null = null;
  let redaction: RedactionConfig & { default_applied?: boolean } = {};
  if (kind === "bill" && mime !== "application/pdf") {
    const parsed = redactionSchema.safeParse({
      top: form.get("top") ?? 0, bottom: form.get("bottom") ?? 0, left: form.get("left") ?? 0, right: form.get("right") ?? 0,
      blurAll: form.get("blurAll") === "true",
    });
    redaction = parsed.success ? parsed.data : { top: 35 };
    // Secure default: never publish a bill preview with nothing covered.
    if (!redaction.top && !redaction.bottom && !redaction.left && !redaction.right && !redaction.blurAll) {
      redaction = { top: 35, default_applied: true };
    }
    try {
      const preview = await makeRedactedPreview(bytes, redaction);
      previewPath = newPath(base, "_preview.jpg");
      await putFile(previewPath, preview, "image/jpeg");
    } catch (e) {
      await removeFiles([storagePath]);
      console.error("[upload] preview", e instanceof Error ? e.message : e);
      return err("unknown", 500);
    }
  }

  const { data: row, error: insErr } = await admin.from("documents").insert({
    request_id: requestId, owner_id: session.userId, kind, storage_path: storagePath, preview_path: previewPath,
    display_name: sanitizeDisplayName(file.name), mime_type: mime, size_bytes: bytes.length, sha256: sha, redaction,
  }).select("id").single();
  if (insErr || !row) {
    await removeFiles([storagePath, ...(previewPath ? [previewPath] : [])]);
    if (insErr?.code === "23505") return err("duplicate_same", 409);
    console.error("[upload] insert", insErr?.message);
    return err("unknown", 500);
  }
  return NextResponse.json({ ok: true, id: row.id, hasPreview: !!previewPath }, { headers: { "Cache-Control": "no-store" } });
}
