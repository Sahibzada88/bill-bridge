import { requireAdmin } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { MfaSetup } from "@/components/admin/mfa-setup";

export const metadata = { title: "Two-factor setup" };

export default async function AdminMfaPage() {
  await requireAdmin({ allowAal1: true }); // this is the one admin page reachable before MFA is complete
  const { t } = await getT();
  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-semibold text-forest-900">{t("ad.mfa")}</h1>
      <MfaSetup />
    </div>
  );
}
