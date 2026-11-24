import Link from "next/link";
import { Plus } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";
import { formatPKR, formatDate, progressPct } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty";
import { Meter } from "@/components/ui/progress";
import { LifecycleBadge, VerificationBadge } from "@/components/status";
import type { RequestRow } from "@/types";

export const metadata = { title: "My requests" };

export default async function RequesterHome() {
  const s = await requireRole("requester");
  const { t, locale } = await getT();
  const supabase = await createClient();
  await supabase.rpc("release_expired_reservations");
  const [{ data }, { count: toConfirm }, { count: questions }] = await Promise.all([
    supabase.from("requests").select("*").order("created_at", { ascending: false }),
    supabase.from("payments").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    supabase.from("info_requests").select("id", { count: "exact", head: true }).eq("status", "open"),
  ]);
  const rows = (data ?? []) as RequestRow[];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold text-forest-900">{t("rq.dashboard")}</h1>
        <Button asChild><Link href="/dashboard/requester/requests/new"><Plus className="size-4" aria-hidden />{t("rf.new")}</Link></Button>
      </div>
      {!s.profile.phone || !s.profile.city ? <Alert variant="warning">{t("rf.profileIncomplete")} <Link href="/dashboard/settings" className="font-semibold underline">{t("nav.settings")}</Link></Alert> : null}
      {toConfirm ? <Alert variant="warning">{t("nt.payment_submitted")} ({toConfirm})</Alert> : null}
      {questions ? <Alert variant="info">{t("nt.info_requested")} ({questions})</Alert> : null}
      {rows.length ? (
        <ul className="space-y-3">
          {rows.map((r) => {
            const pct = progressPct(r.amount_paid, r.amount_due);
            return (
              <li key={r.id} className="rounded-lg border border-line bg-paper p-4">
                <div className="flex flex-wrap items-center gap-2"><LifecycleBadge status={r.lifecycle} t={t} />{r.lifecycle !== "draft" ? <VerificationBadge status={r.verification_status} t={t} /> : null}</div>
                <h2 className="mt-2 font-display text-lg font-semibold text-forest-900"><Link href={`/dashboard/requester/requests/${r.id}`} className="hover:underline">{r.title}</Link></h2>
                <p className="text-sm text-muted">{r.provider_name} · {r.city} · {t("common.due")} {formatDate(r.due_date, locale)}</p>
                <div className="mt-3 max-w-md"><div className="mb-1 flex justify-between text-sm"><span>{formatPKR(r.amount_paid, locale)}</span><span className="text-muted">{formatPKR(r.amount_due, locale)}</span></div><Meter percent={pct} label={`${pct}%`} /></div>
              </li>
            );
          })}
        </ul>
      ) : <EmptyState title={t("rq.noRequests")} action={<Button asChild><Link href="/dashboard/requester/requests/new">{t("rq.createFirst")}</Link></Button>} />}
    </div>
  );
}
