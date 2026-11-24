import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { CaptchaScript } from "@/components/captcha-script";
import { RegisterForm } from "@/components/forms/auth-forms";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Create account" };

export default async function RegisterPage() {
  const { t } = await getT();
  return (
    <AuthShell title={t("auth.register.title")} subtitle={t("auth.register.subtitle")}
      footer={<>{t("auth.haveAccount")} <Link href="/login" className="font-semibold text-forest-700 underline underline-offset-4">{t("auth.submit.login")}</Link></>}>
      <CaptchaScript />
      <RegisterForm />
    </AuthShell>
  );
}
