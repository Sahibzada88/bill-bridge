import { getT } from "@/lib/i18n/server";
import { PageShell } from "@/components/page-shell";
export const metadata = { title: "FAQ" };
export default async function FaqPage() {
  const { t } = await getT();
  const items = [1, 2, 3, 4, 5, 6, 7] as const;
  return (
    <PageShell title={t("pub.faq.title")} narrow>
      <div className="divide-y divide-line rounded-lg border border-line bg-paper">
        {items.map((n) => (
          <details key={n} className="group px-5 py-4">
            <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-4 font-display text-lg font-semibold text-forest-900 [&::-webkit-details-marker]:hidden">
              {t(`faq.q${n}` as `faq.q1`)}
              <span aria-hidden className="text-forest-600 transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="mt-2 text-muted">{t(`faq.a${n}` as `faq.a1`)}</p>
          </details>
        ))}
      </div>
    </PageShell>
  );
}
