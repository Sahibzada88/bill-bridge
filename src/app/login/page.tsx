import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { CaptchaScript } from "@/components/captcha-script";
import { LoginForm } from "@/components/forms/auth-forms";
import { Alert } from "@/components/ui/alert";
import { getSession } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { safeRedirectPath } from "@/lib/utils";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const { t } = await getT();
  const session = await getSession();
  if (session && !session.profile.is_suspended) redirect(safeRedirectPath(sp.next));
  return (
    <AuthShell title={t("auth.login.title")} subtitle={t("auth.login.subtitle")}
      footer={<>{t("auth.noAccount")} <Link href="/register" className="font-semibold text-forest-700 underline underline-offset-4">{t("auth.submit.register")}</Link></>}>
      <CaptchaScript />
      {sp.error === "suspended" ? <Alert variant="error" className="mb-4">{t("auth.err.suspended")}</Alert> : null}
      {sp.error === "callback" ? <Alert variant="error" className="mb-4">{t("common.error")}</Alert> : null}
      <LoginForm next={sp.next} />
    </AuthShell>
  );
}
