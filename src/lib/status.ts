import type { Lifecycle, VerificationStatus, PaymentStatus } from "@/types";
import type { Tone } from "@/components/ui/badge";

/** Display order of the donor-driven verification stages. */
export const VERIFICATION_ORDER: VerificationStatus[] = [
  "uploaded_unverified", "donor_reviewed", "info_requested", "info_provided",
  "donor_satisfied", "payment_submitted", "requester_confirmed", "completed",
];

export function verificationTone(s: VerificationStatus): Tone {
  switch (s) {
    case "uploaded_unverified": return "neutral";
    case "donor_reviewed": case "donor_satisfied": return "blue";
    case "info_requested": case "payment_submitted": return "amber";
    case "info_provided": return "blue";
    case "requester_confirmed": case "completed": return "green";
    case "payment_disputed": return "red";
  }
}
export function lifecycleTone(l: Lifecycle): Tone {
  switch (l) {
    case "open": return "green";
    case "reserved": case "payment_pending": return "amber";
    case "completed": return "green";
    case "cancelled": case "removed": return "red";
    default: return "neutral";
  }
}
export function paymentTone(s: PaymentStatus): Tone {
  switch (s) {
    case "submitted": return "amber";
    case "confirmed": case "resolved_valid": return "green";
    case "disputed": case "resolved_invalid": return "red";
  }
}
