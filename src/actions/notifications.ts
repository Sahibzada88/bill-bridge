"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRoleForAction } from "@/lib/action-auth";
import { z } from "zod";

export async function markNotificationReadAction(id: string): Promise<void> {
  const auth = await requireRoleForAction("any");
  if (!auth || !z.string().uuid().safeParse(id).success) return;
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("user_id", auth.userId);
  revalidatePath("/", "layout");
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const auth = await requireRoleForAction("any");
  if (!auth) return;
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", auth.userId).is("read_at", null);
  revalidatePath("/", "layout");
}
