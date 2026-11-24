import { ShieldAlert } from "lucide-react";
import { getT } from "@/lib/i18n/server";
import { PageShell } from "@/components/page-shell";
export const metadata = { title: "Safety" };
export default async function SafetyPage() {
  const { t } = await getT();
  return (
    <PageShell title={t("pub.safety.title")} narrow>
      <ul className="space-y-4">
        {([1, 2, 3, 4, 5, 6] as const).map((n) => (
          <li key={n} className="flex gap-3 rounded-lg border border-line bg-paper p-4">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-forest-600" aria-hidden />
            <p>{t(`safety.${n}` as `safety.1`)}</p>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
