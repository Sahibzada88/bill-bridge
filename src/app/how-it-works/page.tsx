import { getT } from "@/lib/i18n/server";
import { PageShell } from "@/components/page-shell";
export const metadata = { title: "How it works" };
export default async function HowPage() {
  const { t } = await getT();
  const steps = [1, 2, 3, 4, 5] as const;
  return (
    <PageShell title={t("pub.how.title")} narrow>
      <ol className="space-y-8">
        {steps.map((n) => (
          <li key={n} className="grid grid-cols-[auto_1fr] gap-4">
            <span className="grid size-10 place-items-center rounded-full bg-forest-700 font-display text-lg font-semibold text-white">{n}</span>
            <div>
              <h2 className="font-display text-xl font-semibold text-forest-900">{t(`pub.how.s${n}.t` as `pub.how.s1.t`)}</h2>
              <p className="mt-1 text-muted">{t(`pub.how.s${n}.b` as `pub.how.s1.b`)}</p>
            </div>
          </li>
        ))}
      </ol>
    </PageShell>
  );
}
