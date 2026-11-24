import { createClient } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";
import { PageShell } from "@/components/page-shell";
import { Alert } from "@/components/ui/alert";
import { formatPKR } from "@/lib/utils";
export const metadata = { title: "Transparency" };
export default async function TransparencyPage() {
  const { t, locale } = await getT();
  const supabase = await createClient();
  const { data: s } = await supabase.from("platform_stats").select("*").maybeSingle();
  const nf = new Intl.NumberFormat(locale === "ur" ? "ur-PK" : "en-PK");
  const rows: [string, string][] = [
    [t("tp.active"), nf.format(s?.active_requests ?? 0)], [t("tp.completed"), nf.format(s?.completed_requests ?? 0)],
    [t("tp.donors"), nf.format(s?.donors ?? 0)], [t("tp.requesters"), nf.format(s?.requesters ?? 0)],
    [t("tp.amount"), formatPKR(Number(s?.total_confirmed_amount ?? 0), locale)], [t("tp.payments"), nf.format(s?.confirmed_payments ?? 0)],
    [t("tp.disputes"), nf.format(s?.disputed_payments ?? 0)], [t("tp.reports"), nf.format(s?.reports_actioned ?? 0)],
  ];
  return (
    <PageShell title={t("pub.transparency.title")} intro={t("pub.transparency.body")}>
      <dl className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {rows.map(([k, v]) => (<div key={k} className="bg-paper p-5"><dd className="font-display text-3xl font-semibold text-forest-900">{v}</dd><dt className="mt-1 text-sm text-muted">{k}</dt></div>))}
      </dl>
      <Alert className="mt-6">{t("tp.note")}</Alert>
    </PageShell>
  );
}
