import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { NewPasswordForm } from "@/components/forms/auth-forms";
import { Alert } from "@/components/ui/alert";
import { getSession } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  const { t } = await getT();
  const session = await getSession(); // the recovery link signs the user in (via /auth/callback) before landing here
  return (
    <AuthShell title={t("auth.reset.new.title")}>
      {session ? <NewPasswordForm /> : (
        <div className="space-y-3">
          <Alert variant="error">{t("common.unauthorized")}</Alert>
          <Link href="/forgot-password" className="font-semibold text-forest-700 underline">{t("auth.reset.send")}</Link>
        </div>
      )}
    </AuthShell>
  );
}
