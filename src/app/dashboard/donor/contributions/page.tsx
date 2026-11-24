import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";
import { formatDateTime, formatPKR } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty";
import { PaymentBadge } from "@/components/status";
import { DisputeResponseForm } from "@/components/donor/donor-controls";
import type { PaymentRow } from "@/types";

export const metadata = { title: "My contributions" };

export default async function ContributionsPage() {
  await requireRole("donor");
  const { t, locale } = await getT();
  const supabase = await createClient();
  const { data } = await supabase.from("payments").select("*").order("created_at", { ascending: false });
  const rows = (data ?? []) as PaymentRow[];
  const ids = [...new Set(rows.map((r) => r.request_id))];
  const { data: cards } = ids.length ? await supabase.from("public_request_cards").select("id, title").in("id", ids) : { data: [] as { id: string; title: string }[] };
  const title = new Map((cards ?? []).map((c) => [c.id, c.title]));
  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-semibold text-forest-900">{t("dn.contributions")}</h1>
      {rows.length ? (
        <ul className="space-y-3">
          {rows.map((p) => (
            <li key={p.id} className="space-y-2 rounded-lg border border-line bg-paper p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-display text-xl font-semibold">{formatPKR(p.amount, locale)}</span><PaymentBadge status={p.status} t={t} /></div>
              <Link href={`/requests/${p.request_id}`} className="text-sm font-semibold text-forest-700 underline underline-offset-4">{title.get(p.request_id) ?? "—"}</Link>
              <p className="text-sm text-muted">{t(`pm.${p.method}`)} · <span dir="ltr">{p.transaction_ref}</span> · {formatDateTime(p.paid_at, locale)}</p>
              {p.status === "disputed" ? (<div className="space-y-2 rounded-md bg-danger-soft p-3 text-sm"><p className="font-semibold text-danger">{p.dispute_reason}</p>{p.donor_response ? <p>↳ {p.donor_response}</p> : <DisputeResponseForm paymentId={p.id} />}</div>) : null}
              {p.admin_note ? <p className="text-sm text-muted">{t("ad.note")}: {p.admin_note}</p> : null}
            </li>
          ))}
        </ul>
      ) : <EmptyState title={t("dn.noContributions")} />}
    </div>
  );
}
