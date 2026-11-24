"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { profileSchema } from "@/lib/validation";
import { fail, fromPgError, zodFail } from "@/lib/action-utils";
import { LOCALE_COOKIE } from "@/lib/i18n";
import type { ActionResult } from "@/types";

export async function updateProfileAction(input: unknown): Promise<ActionResult> {
  const { t } = await getT();
  const s = await getSession();
  if (!s) return fail(t, "not_authenticated");
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return zodFail(t, parsed.error);
  const v = parsed.data;
  const supabase = await createClient();
  // Column-level grants mean only these columns are writable by the client; role cannot be touched.
  const { error } = await supabase.from("profiles").update({
    full_name: v.fullName, phone: v.phone || null, city: v.city || null, bio: v.bio || null, preferred_locale: v.locale, email_notifications: v.emailNotifications,
  }).eq("id", s.userId);
  if (error) return fromPgError(t, error);
  (await cookies()).set(LOCALE_COOKIE, v.locale, { path: "/", maxAge: 31536000, sameSite: "lax" });
  revalidatePath("/", "layout");
  return { ok: true, message: t("st.profileSaved") };
}
