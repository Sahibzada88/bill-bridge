export type Role = "requester" | "donor" | "admin";
export type UtilityType = "electricity" | "gas" | "water" | "internet" | "phone" | "other";
export type Lifecycle = "draft" | "open" | "reserved" | "payment_pending" | "completed" | "cancelled" | "removed";
export type VerificationStatus =
  | "uploaded_unverified" | "donor_reviewed" | "info_requested" | "info_provided" | "donor_satisfied"
  | "payment_submitted" | "requester_confirmed" | "payment_disputed" | "completed";
export type PaymentMethod = "easypaisa" | "jazzcash" | "bank_app" | "other";
export type PaymentStatus = "submitted" | "confirmed" | "disputed" | "resolved_valid" | "resolved_invalid";
export type DocKind = "bill" | "supporting" | "receipt";

export interface Profile {
  id: string; role: Role; full_name: string; phone: string | null; city: string | null; bio: string | null;
  preferred_locale: "en" | "ur"; email_notifications: boolean; is_suspended: boolean; created_at: string;
}
export interface PublicRequestCard {
  id: string; title: string; description: string; utility_type: UtilityType; provider_name: string; city: string;
  amount_due: number; amount_paid: number; currency: string; due_date: string; lifecycle: Lifecycle;
  verification_status: VerificationStatus; created_at: string; published_at: string | null;
  requester_first_name: string; review_count: number; satisfied_count: number; has_preview: boolean;
}
export interface RequestRow {
  id: string; requester_id: string; title: string; description: string; utility_type: UtilityType; provider_name: string;
  city: string; amount_due: number; amount_paid: number; due_date: string; hardship_note: string | null;
  lifecycle: Lifecycle; verification_status: VerificationStatus; flagged: boolean; created_at: string; updated_at: string;
}
export interface DocumentRow {
  id: string; request_id: string; owner_id: string; kind: DocKind; display_name: string; mime_type: string;
  size_bytes: number; preview_path: string | null; status: string; created_at: string;
}
export interface ReservationRow { id: string; request_id: string; donor_id: string; status: "active" | "expired" | "cancelled" | "converted"; expires_at: string; created_at: string }
export interface PaymentRow {
  id: string; request_id: string; donor_id: string; reservation_id: string; amount: number; method: PaymentMethod;
  transaction_ref: string; paid_at: string; receipt_document_id: string; status: PaymentStatus;
  requester_note: string | null; dispute_reason: string | null; donor_response: string | null; admin_note: string | null; created_at: string;
}
export interface InfoRequestRow { id: string; request_id: string; donor_id: string; question: string; response: string | null; status: "open" | "answered" | "closed"; created_at: string; answered_at: string | null }
export interface NotificationRow { id: string; type: string; link: string | null; data: Record<string, unknown>; read_at: string | null; created_at: string }
export interface RequestEvent { id: number; request_id: string; actor_id: string | null; event_type: string; from_status: string | null; to_status: string | null; metadata: Record<string, unknown>; created_at: string }

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; code?: string; fieldErrors?: Record<string, string> };
