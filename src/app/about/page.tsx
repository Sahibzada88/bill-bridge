import { getT } from "@/lib/i18n/server";
import { PageShell } from "@/components/page-shell";
export const metadata = { title: "About" };
export default async function AboutPage() {
  const { t } = await getT();
  return (
    <PageShell title={t("pub.about.title")} narrow>
      <div className="space-y-4 text-lg leading-relaxed">
        <p>{t("pub.about.p1")}</p><p>{t("pub.about.p2")}</p><p className="font-semibold text-forest-900">{t("pub.about.p3")}</p>
      </div>
    </PageShell>
  );
}
