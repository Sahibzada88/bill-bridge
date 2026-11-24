import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";
import { formatPKR } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody } from "@/components/ui/card";
import { Countdown } from "@/components/countdown";
import type { PaymentRow, ReservationRow } from "@/types";

export const metadata = { title: "Donor dashboard" };

export default async function DonorHome() {
  const s = await requireRole("donor");
  const { t, locale } = await getT();
  const supabase = await createClient();
  await supabase.rpc("release_expired_reservations");
  const [{ data: res }, { data: pays }, { count: saved }] = await Promise.all([
    supabase.from("reservations").select("*").eq("status", "active").gt("expires_at", new Date().toISOString()),
    supabase.from("payments").select("*"),
    supabase.from("saved_requests").select("request_id", { count: "exact", head: true }),
  ]);
  const active = (res ?? []) as ReservationRow[];
  const payments = (pays ?? []) as PaymentRow[];
  const confirmed = payments.filter((p) => p.status === "confirmed" || p.status === "resolved_valid");
  const total = confirmed.reduce((a, p) => a + Number(p.amount), 0);
  const disputed = payments.filter((p) => p.status === "disputed");
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold text-forest-900">{t("nav.dashboard")}</h1>
      {!s.emailConfirmed ? <Alert variant="warning">{t("err.email_not_verified")}</Alert> : null}
      {disputed.length ? <Alert variant="error">{t("nt.payment_disputed")} <Link className="font-semibold underline" href="/dashboard/donor/contributions">{t("dn.contributions")}</Link></Alert> : null}
      <dl className="grid gap-3 sm:grid-cols-3">
        {[[t("dn.reservations"), String(active.length)], [t("dn.contributions"), `${confirmed.length} · ${formatPKR(total, locale)}`], [t("dn.savedList"), String(saved ?? 0)]].map(([k, v]) => (
          <Card key={k}><CardBody className="pt-5"><dd className="font-display text-2xl font-semibold text-forest-900">{v}</dd><dt className="text-sm text-muted">{k}</dt></CardBody></Card>
        ))}
      </dl>
      {active.length ? (
        <section><h2 className="font-display text-xl font-semibold text-forest-900">{t("dn.reservations")}</h2>
          <ul className="mt-3 space-y-2">{active.map((r) => (<li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-forest-200 bg-forest-50 p-4"><Countdown expiresAt={r.expires_at} /><Button asChild size="sm"><Link href={`/requests/${r.request_id}`}>{t("common.open")}</Link></Button></li>))}</ul>
        </section>
      ) : null}
      <Button asChild size="lg"><Link href="/requests">{t("home.cta.donate")}</Link></Button>
    </div>
  );
}
