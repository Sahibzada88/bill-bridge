"use server";
import { getT } from "@/lib/i18n/server";
import { contactSchema } from "@/lib/validation";
import { fail, zodFail } from "@/lib/action-utils";
import { rateLimitByIp } from "@/lib/security/rate-limit";
import { verifyCaptcha } from "@/lib/security/turnstile";
import { getClientIp, getClientIpHash } from "@/lib/security/ip";
import { createAdminClient } from "@/lib/supabase/admin";
import { after } from "next/server";
import { emailConfigured, sendContactEmail } from "@/lib/email";
import type { ActionResult } from "@/types";

export async function contactAction(input: unknown, captchaToken: string | null): Promise<ActionResult> {
  const { t } = await getT();
  const p = contactSchema.safeParse(input);
  if (!p.success) return zodFail(t, p.error);
  if (!(await rateLimitByIp("contact", 3, 3600)).ok) return fail(t, "rate");
  const c = await verifyCaptcha(captchaToken, await getClientIp());
  if (!c.ok) return fail(t, "captcha", { error: t("auth.err.captcha") });
  const admin = createAdminClient();
  const { error } = await admin.from("contact_messages").insert({ ...p.data, ip_hash: await getClientIpHash() });
  if (error) { console.error("[contact]", error.message); return fail(t, "unknown"); }
  if (emailConfigured()) after(() => sendContactEmail(p.data).catch((e) => console.error("[contact-email]", e instanceof Error ? e.message : e)));
  return { ok: true, message: t("pub.contact.sent") };
}
