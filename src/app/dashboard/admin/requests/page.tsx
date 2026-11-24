import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";
import { formatPKR } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { LifecycleBadge, VerificationBadge } from "@/components/status";
import { RequestAdminControls } from "@/components/admin/admin-controls";
import type { RequestRow } from "@/types";

export const metadata = { title: "Requests" };
const LIFECYCLES = ["open", "reserved", "payment_pending", "completed", "cancelled", "removed", "draft"] as const;

export default async function AdminRequests({ searchParams }: { searchParams: Promise<{ lifecycle?: string; flagged?: string }> }) {
  await requireAdmin();
  const { t, locale } = await getT();
  const sp = await searchParams;
  const supabase = await createClient();
  let q = supabase.from("requests").select("*").order("created_at", { ascending: false }).limit(100);
  if (sp.lifecycle && (LIFECYCLES as readonly string[]).includes(sp.lifecycle)) q = q.eq("lifecycle", sp.lifecycle as (typeof LIFECYCLES)[number]);
  if (sp.flagged === "1") q = q.eq("flagged", true);
  const { data } = await q;
  const rows = (data ?? []) as RequestRow[];
  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-semibold text-forest-900">{t("ad.requests")}</h1>
      <nav aria-label="filters" className="flex flex-wrap gap-2">
        <Link href="/dashboard/admin/requests" className="rounded-full border border-line bg-paper px-3 py-1.5 text-sm font-semibold">{t("common.clear")}</Link>
        <Link href="/dashboard/admin/requests?flagged=1" className="rounded-full border border-warn bg-warn-soft px-3 py-1.5 text-sm font-semibold">{t("ad.flagged")}</Link>
        {LIFECYCLES.map((l) => <Link key={l} href={`/dashboard/admin/requests?lifecycle=${l}`} className="rounded-full border border-line bg-paper px-3 py-1.5 text-sm font-semibold">{t(`lc.${l}`)}</Link>)}
      </nav>
      {rows.length ? (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="space-y-2 rounded-lg border border-line bg-paper p-4">
              <div className="flex flex-wrap items-center gap-2"><LifecycleBadge status={r.lifecycle} t={t} /><VerificationBadge status={r.verification_status} t={t} />{r.flagged ? <Badge tone="red">{t("ad.flagged")}</Badge> : null}</div>
              <p className="font-display text-lg font-semibold text-forest-900"><Link href={`/requests/${r.id}`} className="hover:underline">{r.title}</Link></p>
              <p className="text-sm text-muted">{r.provider_name} · {r.city} · {formatPKR(r.amount_paid, locale)} / {formatPKR(r.amount_due, locale)}</p>
              <RequestAdminControls requestId={r.id} lifecycle={r.lifecycle} flagged={r.flagged} />
            </li>
          ))}
        </ul>
      ) : <p className="text-muted">{t("ad.noData")}</p>}
    </div>
  );
}
