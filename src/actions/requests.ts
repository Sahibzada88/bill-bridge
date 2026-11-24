"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRoleForAction } from "@/lib/action-auth";
import { getT } from "@/lib/i18n/server";
import { requestSchema } from "@/lib/validation";
import { fail, fromPgError, zodFail } from "@/lib/action-utils";
import { rateLimitByUser } from "@/lib/security/rate-limit";
import type { ActionResult } from "@/types";

export async function createRequestAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const { t } = await getT();
  const auth = await requireRoleForAction("requester");
  if (!auth) return fail(t, "forbidden");
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return zodFail(t, parsed.error);
  if (!(await rateLimitByUser("create-request", auth.userId, 10, 3600)).ok) return fail(t, "rate");
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.from("requests").insert({
    requester_id: auth.userId, title: v.title, description: v.description, utility_type: v.utilityType,
    provider_name: v.providerName, city: v.city, amount_due: v.amountDue, due_date: v.dueDate,
    hardship_note: v.hardshipNote || null,
  }).select("id").single();
  if (error || !data) return fromPgError(t, error);

  const { error: e2 } = await supabase.from("request_payment_details").insert({
    request_id: data.id, consumer_ref: v.consumerRef, account_title: v.accountTitle || null, payment_note: v.paymentNote || null,
  });
  if (e2) return fromPgError(t, e2);
  revalidatePath("/dashboard/requester");
  return { ok: true, data: { id: data.id }, message: t("rf.created") };
}

export async function updateRequestAction(requestId: string, input: unknown): Promise<ActionResult> {
  const { t } = await getT();
  const auth = await requireRoleForAction("requester");
  if (!auth) return fail(t, "forbidden");
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return zodFail(t, parsed.error);
  const v = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase.from("requests").update({
    title: v.title, description: v.description, utility_type: v.utilityType, provider_name: v.providerName,
    city: v.city, amount_due: v.amountDue, due_date: v.dueDate, hardship_note: v.hardshipNote || null,
  }).eq("id", requestId).select("id");
  if (error) return fromPgError(t, error);
  if (!data?.length) return fail(t, "request_not_editable");  // RLS filtered it out (not yours / not editable)

  const { error: e2 } = await supabase.from("request_payment_details")
    .update({ consumer_ref: v.consumerRef, account_title: v.accountTitle || null, payment_note: v.paymentNote || null })
    .eq("request_id", requestId);
  if (e2) return fromPgError(t, e2);
  revalidatePath(`/dashboard/requester/requests/${requestId}`);
  return { ok: true, message: t("common.saved") };
}

export async function publishRequestAction(requestId: string): Promise<ActionResult> {
  const { t } = await getT();
  const auth = await requireRoleForAction("requester");
  if (!auth) return fail(t, "forbidden");
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_request", { p_request_id: requestId });
  if (error) return fromPgError(t, error);
  revalidatePath("/dashboard/requester"); revalidatePath("/requests");
  return { ok: true, message: t("rf.published") };
}

export async function cancelRequestAction(requestId: string): Promise<ActionResult> {
  const { t } = await getT();
  const auth = await requireRoleForAction("requester");
  if (!auth) return fail(t, "forbidden");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_request", { p_request_id: requestId });
  if (error) return fromPgError(t, error);
  revalidatePath("/dashboard/requester"); revalidatePath("/requests");
  return { ok: true, message: t("rf.cancelled") };
}
