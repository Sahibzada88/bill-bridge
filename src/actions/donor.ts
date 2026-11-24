"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRoleForAction } from "@/lib/action-auth";
import { getT } from "@/lib/i18n/server";
import { serverEnv } from "@/lib/env";
import { questionSchema, reviewSchema, reportSchema, paymentSchema, disputeResponseSchema } from "@/lib/validation";
import { fail, fromPgError, zodFail } from "@/lib/action-utils";
import { kickEmails } from "@/lib/email";
import { rateLimitByUser } from "@/lib/security/rate-limit";
import { z } from "zod";
import type { ActionResult } from "@/types";

const uuid = z.string().uuid();

export async function reserveAction(requestId: string): Promise<ActionResult> {
  const { t } = await getT();
  const auth = await requireRoleForAction("donor");
  if (!auth || !uuid.safeParse(requestId).success) return fail(t, "forbidden");
  if (!(await rateLimitByUser("reserve", auth.userId, 15, 600)).ok) return fail(t, "rate");
  const supabase = await createClient();
  const { error } = await supabase.rpc("reserve_request", { p_request_id: requestId, p_minutes: serverEnv().RESERVATION_MINUTES });
  if (error) return fromPgError(t, error);
  revalidatePath(`/requests/${requestId}`); revalidatePath("/dashboard/donor/reservations");
  kickEmails();
  return { ok: true };
}

export async function cancelReservationAction(reservationId: string): Promise<ActionResult> {
  const { t } = await getT();
  const auth = await requireRoleForAction("donor");
  if (!auth || !uuid.safeParse(reservationId).success) return fail(t, "forbidden");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_reservation", { p_reservation_id: reservationId });
  if (error) return fromPgError(t, error);
  revalidatePath("/dashboard/donor/reservations"); revalidatePath("/requests");
  kickEmails();
  return { ok: true };
}

export async function markReviewedAction(input: unknown): Promise<ActionResult> {
  const { t } = await getT();
  const auth = await requireRoleForAction("donor");
  if (!auth) return fail(t, "forbidden");
  const p = reviewSchema.safeParse(input);
  if (!p.success) return zodFail(t, p.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_reviewed", { p_request_id: p.data.requestId, p_note: p.data.note || null });
  if (error) return fromPgError(t, error);
  revalidatePath(`/requests/${p.data.requestId}`);
  kickEmails();
  return { ok: true, message: t("dn.reviewed") };
}

export async function markSatisfiedAction(requestId: string): Promise<ActionResult> {
  const { t } = await getT();
  const auth = await requireRoleForAction("donor");
  if (!auth || !uuid.safeParse(requestId).success) return fail(t, "forbidden");
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_satisfied", { p_request_id: requestId });
  if (error) return fromPgError(t, error);
  revalidatePath(`/requests/${requestId}`);
  kickEmails();
  return { ok: true, message: t("dn.satisfied") };
}

export async function askInfoAction(input: unknown): Promise<ActionResult> {
  const { t } = await getT();
  const auth = await requireRoleForAction("donor");
  if (!auth) return fail(t, "forbidden");
  const p = questionSchema.safeParse(input);
  if (!p.success) return zodFail(t, p.error);
  if (!(await rateLimitByUser("ask-info", auth.userId, 10, 3600)).ok) return fail(t, "rate");
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_info", { p_request_id: p.data.requestId, p_question: p.data.question });
  if (error) return fromPgError(t, error);
  revalidatePath(`/requests/${p.data.requestId}`);
  kickEmails();
  return { ok: true, message: t("dn.askInfo.sent") };
}

export async function toggleSaveAction(requestId: string, save: boolean): Promise<ActionResult> {
  const { t } = await getT();
  const auth = await requireRoleForAction("donor");
  if (!auth || !uuid.safeParse(requestId).success) return fail(t, "forbidden");
  const supabase = await createClient();
  const { error } = save
    ? await supabase.from("saved_requests").upsert({ donor_id: auth.userId, request_id: requestId }, { onConflict: "donor_id,request_id", ignoreDuplicates: true })
    : await supabase.from("saved_requests").delete().eq("donor_id", auth.userId).eq("request_id", requestId);
  if (error) return fromPgError(t, error);
  revalidatePath("/dashboard/donor/saved"); revalidatePath(`/requests/${requestId}`);
  kickEmails();
  return { ok: true };
}

export async function reportAction(input: unknown): Promise<ActionResult> {
  const { t } = await getT();
  const auth = await requireRoleForAction("any");
  if (!auth) return fail(t, "not_authenticated");
  const p = reportSchema.safeParse(input);
  if (!p.success) return zodFail(t, p.error);
  if (!(await rateLimitByUser("report", auth.userId, 10, 3600)).ok) return fail(t, "rate");
  const supabase = await createClient();
  const { error } = await supabase.from("reports").insert({
    request_id: p.data.requestId, reporter_id: auth.userId, reason: p.data.reason, details: p.data.details || null,
  });
  if (error) {
    if (error.code === "23505") return { ok: true, message: t("dn.report.sent") }; // already reported: idempotent
    return fromPgError(t, error);
  }
  kickEmails();
  return { ok: true, message: t("dn.report.sent") };
}

export async function startThreadAction(requestId: string): Promise<ActionResult<{ threadId: string }>> {
  const { t } = await getT();
  const auth = await requireRoleForAction("donor");
  if (!auth || !uuid.safeParse(requestId).success) return fail(t, "forbidden");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_or_create_thread", { p_request_id: requestId });
  if (error || !data) return fromPgError(t, error);
  kickEmails();
  return { ok: true, data: { threadId: data as string } };
}

export async function submitPaymentAction(input: unknown): Promise<ActionResult> {
  const { t } = await getT();
  const auth = await requireRoleForAction("donor");
  if (!auth) return fail(t, "forbidden");
  const p = paymentSchema.safeParse(input);
  if (!p.success) return zodFail(t, p.error);
  if (!(await rateLimitByUser("submit-payment", auth.userId, 10, 3600)).ok) return fail(t, "rate");
  const v = p.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_payment", {
    p_reservation_id: v.reservationId, p_amount: v.amount, p_method: v.method, p_transaction_ref: v.transactionRef,
    p_paid_at: new Date(v.paidAt).toISOString(), p_receipt_document_id: v.receiptDocumentId,
  });
  if (error) return fromPgError(t, error);
  revalidatePath("/dashboard/donor"); revalidatePath("/requests");
  kickEmails();
  return { ok: true, message: t("dn.paymentSent") };
}

export async function respondDisputeAction(input: unknown): Promise<ActionResult> {
  const { t } = await getT();
  const auth = await requireRoleForAction("donor");
  if (!auth) return fail(t, "forbidden");
  const p = disputeResponseSchema.safeParse(input);
  if (!p.success) return zodFail(t, p.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_to_dispute", { p_payment_id: p.data.paymentId, p_response: p.data.response });
  if (error) return fromPgError(t, error);
  revalidatePath("/dashboard/donor/contributions");
  kickEmails();
  return { ok: true, message: t("dn.responded") };
}
