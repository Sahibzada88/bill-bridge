"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRoleForAction } from "@/lib/action-auth";
import { getT } from "@/lib/i18n/server";
import { kickEmails } from "@/lib/email";
import { fail, fromPgError } from "@/lib/action-utils";
import type { ActionResult } from "@/types";

const uuid = z.string().uuid();
const note = z.string().trim().max(1000).optional();

async function guard() {
  const { t } = await getT();
  const s = await requireRoleForAction("admin");
  return { t, s };
}
// Every admin RPC re-checks is_admin() (role + MFA/aal2) inside the database, so these checks are defense in depth.

export async function setRoleAction(userId: string, role: "requester" | "donor" | "admin"): Promise<ActionResult> {
  const { t, s } = await guard();
  if (!s || !uuid.safeParse(userId).success || !["requester", "donor", "admin"].includes(role)) return fail(t, "forbidden");
  const { error } = await (await createClient()).rpc("admin_set_role", { p_user: userId, p_role: role });
  if (error) return fromPgError(t, error);
  revalidatePath("/dashboard/admin/users");
  kickEmails();
  return { ok: true, message: t("ad.done") };
}

export async function suspendUserAction(userId: string, suspend: boolean, reason?: string): Promise<ActionResult> {
  const { t, s } = await guard();
  if (!s || !uuid.safeParse(userId).success || !note.safeParse(reason).success) return fail(t, "forbidden");
  const { error } = await (await createClient()).rpc("admin_suspend_user", { p_user: userId, p_suspend: suspend, p_reason: reason ?? null });
  if (error) return fromPgError(t, error);
  revalidatePath("/dashboard/admin/users");
  kickEmails();
  return { ok: true, message: t("ad.done") };
}

export async function moderateRequestAction(requestId: string, action: "remove" | "restore" | "unflag", n?: string): Promise<ActionResult> {
  const { t, s } = await guard();
  if (!s || !uuid.safeParse(requestId).success || !["remove", "restore", "unflag"].includes(action) || !note.safeParse(n).success) return fail(t, "forbidden");
  const { error } = await (await createClient()).rpc("admin_moderate_request", { p_request_id: requestId, p_action: action, p_note: n ?? null });
  if (error) return fromPgError(t, error);
  revalidatePath("/dashboard/admin/requests"); revalidatePath("/requests");
  kickEmails();
  return { ok: true, message: t("ad.done") };
}

export async function resolveReportAction(reportId: string, status: "reviewing" | "actioned" | "dismissed", n?: string): Promise<ActionResult> {
  const { t, s } = await guard();
  if (!s || !uuid.safeParse(reportId).success || !["reviewing", "actioned", "dismissed"].includes(status) || !note.safeParse(n).success) return fail(t, "forbidden");
  const { error } = await (await createClient()).rpc("admin_resolve_report", { p_report_id: reportId, p_status: status, p_note: n ?? null });
  if (error) return fromPgError(t, error);
  revalidatePath("/dashboard/admin/reports");
  kickEmails();
  return { ok: true, message: t("ad.done") };
}

export async function resolveDisputeAction(paymentId: string, valid: boolean, n?: string): Promise<ActionResult> {
  const { t, s } = await guard();
  if (!s || !uuid.safeParse(paymentId).success || !note.safeParse(n).success) return fail(t, "forbidden");
  const { error } = await (await createClient()).rpc("admin_resolve_dispute", { p_payment_id: paymentId, p_valid: valid, p_note: n ?? "" });
  if (error) return fromPgError(t, error);
  revalidatePath("/dashboard/admin/payments");
  kickEmails();
  return { ok: true, message: t("ad.done") };
}
