"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRoleForAction } from "@/lib/action-auth";
import { getT } from "@/lib/i18n/server";
import { answerSchema, confirmSchema, disputeSchema } from "@/lib/validation";
import { fail, fromPgError, zodFail } from "@/lib/action-utils";
import { kickEmails } from "@/lib/email";
import { rateLimitByUser } from "@/lib/security/rate-limit";
import type { ActionResult } from "@/types";

export async function answerInfoAction(input: unknown): Promise<ActionResult> {
  const { t } = await getT();
  const auth = await requireRoleForAction("requester");
  if (!auth) return fail(t, "forbidden");
  const p = answerSchema.safeParse(input);
  if (!p.success) return zodFail(t, p.error);
  if (!(await rateLimitByUser("answer", auth.userId, 30, 3600)).ok) return fail(t, "rate");
  const supabase = await createClient();
  const { error } = await supabase.rpc("answer_info_request", { p_info_id: p.data.infoId, p_response: p.data.response });
  if (error) return fromPgError(t, error);
  revalidatePath("/dashboard/requester", "layout");
  kickEmails();
  return { ok: true, message: t("rq.answered") };
}

export async function confirmPaymentAction(input: unknown): Promise<ActionResult> {
  const { t } = await getT();
  const auth = await requireRoleForAction("requester");
  if (!auth) return fail(t, "forbidden");
  const p = confirmSchema.safeParse(input);
  if (!p.success) return zodFail(t, p.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_payment", { p_payment_id: p.data.paymentId, p_note: p.data.note || null });
  if (error) return fromPgError(t, error);
  revalidatePath("/dashboard/requester", "layout"); revalidatePath("/requests");
  kickEmails();
  return { ok: true, message: t("rq.confirmed") };
}

export async function disputePaymentAction(input: unknown): Promise<ActionResult> {
  const { t } = await getT();
  const auth = await requireRoleForAction("requester");
  if (!auth) return fail(t, "forbidden");
  const p = disputeSchema.safeParse(input);
  if (!p.success) return zodFail(t, p.error);
  if (!(await rateLimitByUser("dispute", auth.userId, 10, 3600)).ok) return fail(t, "rate");
  const supabase = await createClient();
  const { error } = await supabase.rpc("dispute_payment", { p_payment_id: p.data.paymentId, p_reason: p.data.reason });
  if (error) return fromPgError(t, error);
  revalidatePath("/dashboard/requester", "layout");
  kickEmails();
  return { ok: true, message: t("rq.disputed") };
}
