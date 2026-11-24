"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRoleForAction } from "@/lib/action-auth";
import { getT } from "@/lib/i18n/server";
import { messageSchema } from "@/lib/validation";
import { fail, fromPgError, zodFail } from "@/lib/action-utils";
import { kickEmails } from "@/lib/email";
import { rateLimitByUser } from "@/lib/security/rate-limit";
import type { ActionResult } from "@/types";

export async function sendMessageAction(input: unknown): Promise<ActionResult> {
  const { t } = await getT();
  const auth = await requireRoleForAction("any");
  if (!auth) return fail(t, "not_authenticated");
  const p = messageSchema.safeParse(input);
  if (!p.success) return zodFail(t, p.error);
  if (!(await rateLimitByUser("message", auth.userId, 20, 60)).ok) return fail(t, "rate");
  const supabase = await createClient();
  // RLS verifies the sender is a participant of this thread and sender_id = auth.uid().
  const { error } = await supabase.from("messages").insert({ thread_id: p.data.threadId, sender_id: auth.userId, body: p.data.body });
  if (error) return fromPgError(t, error);
  revalidatePath(`/dashboard/messages/${p.data.threadId}`);
  kickEmails();
  return { ok: true };
}

export async function markThreadReadAction(threadId: string): Promise<void> {
  const auth = await requireRoleForAction("any");
  if (!auth) return;
  const supabase = await createClient();
  await supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("thread_id", threadId).neq("sender_id", auth.userId).is("read_at", null);
}
