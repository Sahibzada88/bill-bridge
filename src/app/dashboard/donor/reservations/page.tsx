import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";
import { formatDateTime, nowMs } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { Countdown } from "@/components/countdown";
import { ReleaseButton } from "@/components/donor/donor-controls";
import type { ReservationRow } from "@/types";

export const metadata = { title: "My reservations" };

export default async function ReservationsPage() {
  await requireRole("donor");
  const { t, locale } = await getT();
  const supabase = await createClient();
  await supabase.rpc("release_expired_reservations");
  const { data } = await supabase.from("reservations").select("*").order("created_at", { ascending: false }).limit(50);
  const rows = (data ?? []) as ReservationRow[];
  const ids = [...new Set(rows.map((r) => r.request_id))];
  const { data: cards } = ids.length ? await supabase.from("public_request_cards").select("id, title").in("id", ids) : { data: [] as { id: string; title: string }[] };
  const title = new Map((cards ?? []).map((c) => [c.id, c.title]));
  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-semibold text-forest-900">{t("dn.reservations")}</h1>
      {rows.length ? (
        <ul className="space-y-3">
          {rows.map((r) => {
            const live = r.status === "active" && new Date(r.expires_at).getTime() > nowMs();
            return (
              <li key={r.id} className="space-y-2 rounded-lg border border-line bg-paper p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/requests/${r.request_id}`} className="font-display text-lg font-semibold text-forest-900 hover:underline">{title.get(r.request_id) ?? "—"}</Link>
                  <Badge tone={live ? "green" : r.status === "converted" ? "blue" : "neutral"}>{live ? t("lc.reserved") : r.status}</Badge>
                </div>
                <p className="text-sm text-muted">{formatDateTime(r.created_at, locale)}</p>
                {live ? <div className="flex flex-wrap items-center gap-3"><Countdown expiresAt={r.expires_at} /><Button asChild size="sm"><Link href={`/requests/${r.request_id}`}>{t("common.open")}</Link></Button><ReleaseButton reservationId={r.id} /></div> : null}
              </li>
            );
          })}
        </ul>
      ) : <EmptyState title={t("dn.noReservations")} action={<Button asChild><Link href="/requests">{t("nav.browse")}</Link></Button>} />}
    </div>
  );
}
