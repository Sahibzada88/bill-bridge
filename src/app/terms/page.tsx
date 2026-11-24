import { getT } from "@/lib/i18n/server";
import { PageShell } from "@/components/page-shell";
export const metadata = { title: "Terms of use" };
export default async function TermsPage() {
  const { t } = await getT();
  return (
    <PageShell title={t("pub.terms.title")} intro={t("pub.updated")} narrow>
      <div className="space-y-6">
        {([1, 2, 3, 4, 5] as const).map((n) => (
          <section key={n}><h2 className="font-display text-xl font-semibold text-forest-900">{t(`terms.${n}.t` as `terms.1.t`)}</h2><p className="mt-1 text-muted">{t(`terms.${n}.b` as `terms.1.b`)}</p></section>
        ))}
      </div>
    </PageShell>
  );
}
