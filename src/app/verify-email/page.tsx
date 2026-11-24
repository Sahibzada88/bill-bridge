import { MailCheck } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Verify your email" };

export default async function VerifyEmailPage() {
  const { t } = await getT();
  return (
    <AuthShell title={t("auth.verify.title")}>
      <div className="flex gap-3"><MailCheck className="mt-1 size-6 shrink-0 text-forest-700" aria-hidden /><p>{t("auth.verify.body")}</p></div>
    </AuthShell>
  );
}
