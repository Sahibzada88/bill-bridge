import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import type { SessionInfo } from "@/lib/auth";

export interface DocWithRequest {
  id: string; request_id: string; owner_id: string; kind: "bill" | "supporting" | "receipt";
  storage_path: string; preview_path: string | null; status: string; mime_type: string;
  requests: { id: string; requester_id: string; lifecycle: string } | null;
}

export const PUBLIC_LIFECYCLES = ["open", "reserved", "payment_pending", "completed"];

export async function loadDocument(id: string): Promise<DocWithRequest | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("documents")
    .select("id, request_id, owner_id, kind, storage_path, preview_path, status, mime_type, requests!inner(id, requester_id, lifecycle)")
    .eq("id", id).maybeSingle();
  return (data as unknown as DocWithRequest) ?? null;
}

/** May this session open the ORIGINAL (unredacted) file? Server-side authorization; storage itself is private. */
export async function canOpenOriginal(s: SessionInfo, doc: DocWithRequest): Promise<boolean> {
  if (doc.status !== "active" || !doc.requests) return false;
  const req = doc.requests;
  const admin = createAdminClient();

  if (s.profile.role === "admin") return s.aal === "aal2"; // admin access is logged by the caller

  if (doc.kind === "receipt") {
    if (doc.owner_id === s.userId) return true;
    if (req.requester_id !== s.userId) return false;
    // The requester may open a receipt only once it is attached to a payment on their request.
    const { data } = await admin.from("payments").select("id").eq("receipt_document_id", doc.id).limit(1);
    return !!data?.length;
  }

  if (req.requester_id === s.userId) return true;
  if (s.profile.role !== "donor" || s.profile.is_suspended) return false;
  if (!["open", "reserved", "payment_pending"].includes(req.lifecycle)) return false;

  if (serverEnv().DONOR_ORIGINAL_ACCESS === "verified") return s.emailConfirmed;

  // Default: only a donor who currently holds a reservation (or already submitted a payment) may open originals.
  const { data: res } = await admin.from("reservations").select("id")
    .eq("request_id", doc.request_id).eq("donor_id", s.userId).eq("status", "active").gt("expires_at", new Date().toISOString()).limit(1);
  if (res?.length) return true;
  const { data: pay } = await admin.from("payments").select("id").eq("request_id", doc.request_id).eq("donor_id", s.userId).limit(1);
  return !!pay?.length;
}
