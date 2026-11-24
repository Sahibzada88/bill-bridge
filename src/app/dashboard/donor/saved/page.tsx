import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";
import { RequestCard } from "@/components/request-card";
import { EmptyState } from "@/components/ui/empty";
import type { PublicRequestCard } from "@/types";

export const metadata = { title: "Saved requests" };

export default async function SavedPage() {
  await requireRole("donor");
  const { t, locale } = await getT();
  const supabase = await createClient();
  const { data: saved } = await supabase.from("saved_requests").select("request_id").order("created_at", { ascending: false });
  const ids = (saved ?? []).map((s) => s.request_id);
  const { data } = ids.length ? await supabase.from("public_request_cards").select("*").in("id", ids) : { data: [] };
  const rows = (data ?? []) as PublicRequestCard[];
  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-semibold text-forest-900">{t("dn.savedList")}</h1>
      {rows.length ? <div className="grid gap-5 sm:grid-cols-2">{rows.map((r) => <RequestCard key={r.id} r={r} t={t} locale={locale} />)}</div> : <EmptyState title={t("common.none")} />}
    </div>
  );
}
