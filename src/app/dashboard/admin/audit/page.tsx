import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Audit log" };

export default async function AdminAudit() {
  await requireAdmin();
  const { t, locale } = await getT();
  const supabase = await createClient();
  const { data } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200);
  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-semibold text-forest-900">{t("ad.audit")}</h1>
      {data?.length ? (
        <div className="overflow-x-auto rounded-lg border border-line bg-paper">
          <table className="w-full min-w-[600px] text-sm"><thead className="bg-mist"><tr>{[t("common.date"), t("common.actions"), "Entity", t("common.note")].map((h) => <th key={h} scope="col" className="px-4 py-2 text-start font-semibold">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">{data.map((a) => (<tr key={a.id} className="align-top"><td className="px-4 py-2 whitespace-nowrap">{formatDateTime(a.created_at, locale)}</td><td className="px-4 py-2 font-mono">{a.action}</td><td className="px-4 py-2 font-mono text-xs" dir="ltr">{a.entity_type}:{a.entity_id}</td><td className="px-4 py-2 font-mono text-xs break-all" dir="ltr">{JSON.stringify(a.metadata)}</td></tr>))}</tbody></table>
        </div>
      ) : <p className="text-muted">{t("ad.noData")}</p>}
    </div>
  );
}
