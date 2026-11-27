import { getT } from "@/lib/i18n/server";
import { PageShell } from "@/components/page-shell";
export const metadata = { title: "Privacy policy" };
export default async function PrivacyPage() {
  const { t } = await getT();
  return (
    <PageShell title={t("pub.privacy.title")} intro={t("pub.updated")} narrow>
      <div className="space-y-6">
        {([1, 2, 3, 4, 5] as const).map((n) => (
          <section key={n}><h2 className="font-display text-xl font-semibold text-forest-900">{t(`privacy.${n}.t` as `privacy.1.t`)}</h2><p className="mt-1 text-muted">{t(`privacy.${n}.b` as `privacy.1.b`)}</p></section>
        ))}
      </div>
    </PageShell>
  );
}
