import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";
import { sanitizeSearchTerm, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserControls } from "@/components/admin/admin-controls";

export const metadata = { title: "Users" };

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const s = await requireAdmin();
  const { t, locale } = await getT();
  const { q } = await searchParams;
  const supabase = await createClient();
  let query = supabase.from("profiles").select("id, role, full_name, phone, city, is_suspended, suspended_reason, created_at").order("created_at", { ascending: false }).limit(100);
  const term = q ? sanitizeSearchTerm(q) : "";
  if (term) query = query.ilike("full_name", `%${term}%`);
  const { data } = await query;
  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-semibold text-forest-900">{t("ad.users")}</h1>
      <form className="flex gap-2" role="search"><label htmlFor="q" className="sr-only">{t("common.search")}</label><Input id="q" name="q" defaultValue={q ?? ""} maxLength={80} placeholder={t("common.search")} /><Button type="submit">{t("common.search")}</Button></form>
      <div className="overflow-x-auto rounded-lg border border-line bg-paper">
        <table className="w-full min-w-[640px] text-start text-sm">
          <thead className="bg-mist text-start"><tr>{[t("auth.fullName"), t("auth.role"), t("common.city"), t("common.date"), t("common.actions")].map((h) => <th key={h} scope="col" className="px-4 py-2 text-start font-semibold">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {(data ?? []).map((u) => (
              <tr key={u.id} className="align-top">
                <td className="px-4 py-3"><p className="font-semibold">{u.full_name}</p><p className="text-xs text-muted" dir="ltr">{u.phone ?? "—"}</p>{u.is_suspended ? <Badge tone="red">{u.suspended_reason || "suspended"}</Badge> : null}</td>
                <td className="px-4 py-3"><Badge tone={u.role === "admin" ? "blue" : "neutral"}>{t(`common.${u.role as "admin" | "donor" | "requester"}`)}</Badge></td>
                <td className="px-4 py-3">{u.city ?? "—"}</td>
                <td className="px-4 py-3">{formatDate(u.created_at, locale)}</td>
                <td className="px-4 py-3"><UserControls userId={u.id} role={u.role} suspended={u.is_suspended} isSelf={u.id === s.userId} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
