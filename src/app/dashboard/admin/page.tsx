import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";
import { formatPKR } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";

export const metadata = { title: "Admin" };

export default async function AdminHome() {
  await requireAdmin();
  const { t, locale } = await getT();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_stats");
  if (error || !data) return <Alert variant="error">{t("common.unauthorized")}</Alert>;
  const s = data as Record<string, number>;
  const tiles: [string, string, boolean?][] = [
    [t("ad.stat.users"), String(s.users_total)], [t("ad.stat.open"), String(s.requests_open)], [t("ad.stat.reserved"), String(s.requests_reserved)],
    [t("ad.stat.pending"), String(s.requests_pending)], [t("ad.stat.completed"), String(s.requests_completed)], [t("ad.stat.flagged"), String(s.requests_flagged), s.requests_flagged > 0],
    [t("ad.stat.reports"), String(s.reports_open), s.reports_open > 0], [t("ad.stat.disputes"), String(s.payments_disputed), s.payments_disputed > 0],
    [t("ad.stat.submitted"), String(s.payments_submitted)], [t("ad.stat.confirmed"), formatPKR(s.amount_confirmed, locale)],
    [t("ad.stat.logins"), String(s.failed_logins_24h), s.failed_logins_24h > 20], [t("ad.stat.suspicious"), String(s.suspicious_24h), s.suspicious_24h > 0],
  ];
  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-semibold text-forest-900">{t("ad.title")} · {t("ad.overview")}</h1>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map(([k, v, warn]) => (
          <div key={k} className={`rounded-lg border p-4 ${warn ? "border-warn bg-warn-soft" : "border-line bg-paper"}`}>
            <dd className="font-display text-2xl font-semibold text-forest-900">{v}</dd><dt className="text-sm text-muted">{k}</dt>
          </div>
        ))}
      </dl>
    </div>
  );
}
