import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientIpHash } from "./ip";
import { kickEmails } from "@/lib/email";

/** Records a security event and (optionally) notifies the user in-app. Never throws. */
export async function logSecurityEvent(userId: string | null, eventType: string, metadata: Record<string, unknown> = {}, notifyUser = false) {
  try {
    const admin = createAdminClient();
    await admin.from("security_events").insert({
      user_id: userId, event_type: eventType, ip_hash: await getClientIpHash(), metadata,
    });
    if (userId && notifyUser) {
      await admin.from("notifications").insert({ user_id: userId, type: "security_event", link: "/dashboard/settings", data: { event: eventType } });
      kickEmails();
    }
  } catch (e) {
    console.error("[security-event] failed", e instanceof Error ? e.message : e);
  }
}
