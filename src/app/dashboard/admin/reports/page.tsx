import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";
import { formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ReportControls } from "@/components/admin/admin-controls";

export const metadata = { title: "Reports" };

export default async function AdminReports() {
  await requireAdmin();
  const { t, locale } = await getT();
  const supabase = await createClient();
  const { data } = await supabase.from("reports").select("*").order("created_at", { ascending: false }).limit(100);
  const rows = data ?? [];
  const reqIds = [...new Set(rows.map((r) => r.request_id))];
  const { data: reqs } = reqIds.length ? await supabase.from("requests").select("id, title, lifecycle").in("id", reqIds) : { data: [] as { id: string; title: string; lifecycle: string }[] };
  const rq = new Map((reqs ?? []).map((r) => [r.id, r]));
  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-semibold text-forest-900">{t("ad.reports")}</h1>
      {rows.length ? (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="space-y-2 rounded-lg border border-line bg-paper p-4">
              <div className="flex flex-wrap items-center gap-2"><Badge tone={r.status === "open" ? "red" : r.status === "reviewing" ? "amber" : "neutral"}>{t(`rs.${r.status as "open"}`)}</Badge><Badge>{t(`rp.${r.reason as "other"}`)}</Badge><span className="text-xs text-muted">{formatDateTime(r.created_at, locale)}</span></div>
              <Link href={`/requests/${r.request_id}`} className="font-display text-lg font-semibold text-forest-900 hover:underline">{rq.get(r.request_id)?.title ?? r.request_id}</Link>
              {r.details ? <p className="text-sm">{r.details}</p> : null}
              {r.admin_note ? <p className="text-sm text-muted">{t("ad.note")}: {r.admin_note}</p> : null}
              <ReportControls reportId={r.id} status={r.status} />
            </li>
          ))}
        </ul>
      ) : <p className="text-muted">{t("ad.noData")}</p>}
    </div>
  );
}
