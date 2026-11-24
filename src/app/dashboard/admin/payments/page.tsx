import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";
import { formatDateTime, formatPKR } from "@/lib/utils";
import { PaymentBadge } from "@/components/status";
import { DisputeControls } from "@/components/admin/admin-controls";
import type { PaymentRow } from "@/types";

export const metadata = { title: "Payments" };

export default async function AdminPayments() {
  await requireAdmin();
  const { t, locale } = await getT();
  const supabase = await createClient();
  const { data } = await supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as PaymentRow[];
  const attention = rows.filter((p) => p.status === "disputed");
  const rest = rows.filter((p) => p.status !== "disputed");
  const Row = ({ p, resolve }: { p: PaymentRow; resolve?: boolean }) => (
    <li className="space-y-2 rounded-lg border border-line bg-paper p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-display text-xl font-semibold">{formatPKR(p.amount, locale)}</span><PaymentBadge status={p.status} t={t} /></div>
      <p className="text-sm text-muted">{t(`pm.${p.method}`)} · <span dir="ltr">{p.transaction_ref}</span> · {formatDateTime(p.paid_at, locale)}</p>
      <div className="flex flex-wrap gap-4 text-sm">
        <Link href={`/requests/${p.request_id}`} className="font-semibold text-forest-700 underline underline-offset-4">{t("ad.requests")}</Link>
        <a href={`/api/documents/${p.receipt_document_id}/signed?type=original`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-forest-700 underline underline-offset-4"><ExternalLink className="size-3.5" aria-hidden />{t("rq.receipt")}</a>
      </div>
      {p.dispute_reason ? <div className="rounded-md bg-danger-soft p-3 text-sm"><p className="font-semibold">{t("ad.disputeDetails")}</p><p>{p.dispute_reason}</p>{p.donor_response ? <p className="mt-1 text-muted">↳ {p.donor_response}</p> : null}</div> : null}
      {p.admin_note ? <p className="text-sm text-muted">{t("ad.note")}: {p.admin_note}</p> : null}
      {resolve ? <DisputeControls paymentId={p.id} /> : null}
    </li>
  );
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold text-forest-900">{t("ad.payments")}</h1>
      {attention.length ? <section><h2 className="mb-3 font-display text-xl font-semibold text-danger">{t("ad.stat.disputes")} ({attention.length})</h2><ul className="space-y-3">{attention.map((p) => <Row key={p.id} p={p} resolve />)}</ul></section> : null}
      <section>{rest.length ? <ul className="space-y-3">{rest.map((p) => <Row key={p.id} p={p} />)}</ul> : !attention.length ? <p className="text-muted">{t("ad.noData")}</p> : null}</section>
    </div>
  );
}
