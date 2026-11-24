"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

export async function setLocaleAction(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: false });
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from("profiles").update({ preferred_locale: locale }).eq("id", user.id);
  } catch { /* cookie is what matters */ }
  revalidatePath("/", "layout");
}
