import { AuthShell } from "@/components/auth-shell";
import { CaptchaScript } from "@/components/captcha-script";
import { ForgotForm } from "@/components/forms/auth-forms";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Reset password" };

export default async function ForgotPage() {
  const { t } = await getT();
  return (
    <AuthShell title={t("auth.reset.title")} subtitle={t("auth.reset.subtitle")}>
      <CaptchaScript />
      <ForgotForm />
    </AuthShell>
  );
}
