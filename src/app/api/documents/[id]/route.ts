import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/auth";
import { loadDocument } from "@/lib/documents";
import { removeFiles } from "@/lib/file-store";
import { isSameOrigin } from "@/lib/security/csrf";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "private, no-store" };

/** DELETE /api/documents/:id — requester removes their own bill/supporting document (soft-delete + storage purge). */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req)) return NextResponse.json({ ok: false, code: "forbidden" }, { status: 403, headers: NO_STORE });
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session || session.profile.role !== "requester" || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ ok: false, code: "forbidden" }, { status: 403, headers: NO_STORE });
  }
  const doc = await loadDocument(id);
  if (!doc || !doc.requests || doc.requests.requester_id !== session.userId || doc.kind === "receipt" || doc.status !== "active") {
    return NextResponse.json({ ok: false, code: "forbidden" }, { status: 404, headers: NO_STORE });
  }
  const lifecycle = doc.requests.lifecycle;
  const allowed = doc.kind === "bill" ? lifecycle === "draft" : ["draft", "open", "reserved"].includes(lifecycle);
  if (!allowed) return NextResponse.json({ ok: false, code: "request_not_editable" }, { status: 409, headers: NO_STORE });

  const admin = createAdminClient();
  const { error } = await admin.from("documents").update({ status: "removed" }).eq("id", id);
  if (error) return NextResponse.json({ ok: false, code: "unknown" }, { status: 500, headers: NO_STORE });
  await removeFiles([doc.storage_path, ...(doc.preview_path ? [doc.preview_path] : [])]);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
