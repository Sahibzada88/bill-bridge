import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";
import { formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Security" };

export default async function AdminSecurity() {
  await requireAdmin();
  const { t, locale } = await getT();
  const supabase = await createClient();
  const [{ data: events }, { data: logs }] = await Promise.all([
    supabase.from("security_events").select("*").order("created_at", { ascending: false }).limit(150),
    supabase.from("document_access_logs").select("id, document_id, request_id, accessor_id, access_type, created_at").eq("access_type", "original").order("created_at", { ascending: false }).limit(50),
  ]);
  const suspicious = (events ?? []).filter((e) => e.event_type.startsWith("suspicious"));
  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl font-semibold text-forest-900">{t("ad.security")}</h1>
      <section><h2 className="mb-3 font-display text-xl font-semibold">{t("ad.duplicates")} / {t("ad.stat.suspicious")}</h2>
        {suspicious.length ? <ul className="space-y-2">{suspicious.map((e) => <li key={e.id} className="rounded-md border border-warn bg-warn-soft p-3 text-sm"><Badge tone="amber">{e.event_type}</Badge> <span className="text-muted">{formatDateTime(e.created_at, locale)}</span><p className="mt-1 break-all font-mono text-xs" dir="ltr">{e.user_id} {JSON.stringify(e.metadata)}</p></li>)}</ul> : <p className="text-muted">{t("ad.noData")}</p>}
      </section>
      <section><h2 className="mb-3 font-display text-xl font-semibold">{t("ad.security")}</h2>
        <div className="overflow-x-auto rounded-lg border border-line bg-paper"><table className="w-full min-w-[560px] text-sm"><tbody className="divide-y divide-line">{(events ?? []).map((e) => (<tr key={e.id}><td className="px-4 py-2 whitespace-nowrap">{formatDateTime(e.created_at, locale)}</td><td className="px-4 py-2 font-mono">{e.event_type}</td><td className="px-4 py-2 font-mono text-xs" dir="ltr">{e.ip_hash?.slice(0, 8) ?? ""}</td></tr>))}</tbody></table></div>
      </section>
      <section><h2 className="mb-3 font-display text-xl font-semibold">{t("ad.accessLogs")}</h2>
        <div className="overflow-x-auto rounded-lg border border-line bg-paper"><table className="w-full min-w-[560px] text-sm"><tbody className="divide-y divide-line">{(logs ?? []).map((l) => (<tr key={l.id}><td className="px-4 py-2 whitespace-nowrap">{formatDateTime(l.created_at, locale)}</td><td className="px-4 py-2 font-mono text-xs" dir="ltr">{l.accessor_id?.slice(0, 8)} → {l.document_id.slice(0, 8)}</td></tr>))}</tbody></table></div>
      </section>
    </div>
  );
}
