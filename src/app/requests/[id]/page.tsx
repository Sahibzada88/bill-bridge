import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { ExternalLink, FileText, Lock, MapPin, CalendarClock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { serverEnv } from "@/lib/env";
import { PUBLIC_LIFECYCLES } from "@/lib/documents";
import { formatDate, formatDateTime, formatPKR, nowMs, progressPct } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Meter } from "@/components/ui/progress";
import { LifecycleBadge, PaymentBadge, VerificationBadge, VerificationTimeline } from "@/components/status";
import { Countdown } from "@/components/countdown";
import {
  AskInfoForm, DisputeResponseForm, MessageButton, PaymentForm, ReleaseButton, ReportForm, ReserveButton, ReviewPanel, SaveButton,
} from "@/components/donor/donor-controls";
import type { InfoRequestRow, PaymentRow, PublicRequestCard, ReservationRow } from "@/types";

type Params = { params: Promise<{ id: string }>; searchParams?: Promise<{ view?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return { title: "Request" };
  const supabase = await createClient();
  const { data } = await supabase.from("public_request_cards").select("title").eq("id", id).maybeSingle();
  return { title: data?.title ?? "Request" };
}

interface PublicDoc { id: string; kind: "bill" | "supporting"; display_name: string; mime_type: string; preview_path: string | null }

export default async function RequestDetailPage({ params, searchParams }: Params) {
  const { id } = await params;
  const publicView = (await searchParams)?.view === "public";
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { t, locale } = await getT();
  const supabase = await createClient();
  const session = await getSession();

  await supabase.rpc("release_expired_reservations");
  const { data: cardData } = await supabase.from("public_request_cards").select("*").eq("id", id).maybeSingle();
  const r = cardData as PublicRequestCard | null;

  if (!r) {
    // Owners may still open their own non-public requests from the dashboard.
    if (session?.profile.role === "requester") {
      const { data: own } = await supabase.from("requests").select("id").eq("id", id).maybeSingle();
      if (own) redirect(`/dashboard/requester/requests/${id}`);
    }
    notFound();
  }
  if (session?.profile.role === "requester" && !publicView) {
    const { data: own } = await supabase.from("requests").select("id").eq("id", id).maybeSingle();
    if (own) redirect(`/dashboard/requester/requests/${id}`);
  }

  // Document list (ids only; files are served by the authorizing signed-URL route).
  const admin = createAdminClient();
  const { data: docRows } = PUBLIC_LIFECYCLES.includes(r.lifecycle)
    ? await admin.from("documents").select("id, kind, display_name, mime_type, preview_path").eq("request_id", id).eq("status", "active").in("kind", ["bill", "supporting"]).order("created_at")
    : { data: [] };
  const docs = (docRows ?? []) as PublicDoc[];
  const previews = docs.filter((d) => d.kind === "bill" && d.preview_path);
  const pdfBills = docs.filter((d) => d.kind === "bill" && !d.preview_path);

  const pct = progressPct(r.amount_paid, r.amount_due);
  const remaining = Math.max(0, Number(r.amount_due) - Number(r.amount_paid));
  const isDonor = session?.profile.role === "donor";
  const minutes = serverEnv().RESERVATION_MINUTES;

  // ----- donor context (all reads are under the donor's own RLS) -----
  let activeRes: ReservationRow | null = null;
  let lateRes: ReservationRow | null = null;
  let myReview: { status: string } | null = null;
  let myInfos: InfoRequestRow[] = [];
  let myPayments: PaymentRow[] = [];
  let saved = false;
  let details: { consumer_ref: string; account_title: string | null; payment_note: string | null } | null = null;
  if (isDonor && session) {
    const [res, rev, info, pay, sv, det] = await Promise.all([
      supabase.from("reservations").select("*").eq("request_id", id).order("created_at", { ascending: false }).limit(5),
      supabase.from("donor_reviews").select("status").eq("request_id", id).maybeSingle(),
      supabase.from("info_requests").select("*").eq("request_id", id).order("created_at", { ascending: false }),
      supabase.from("payments").select("*").eq("request_id", id).order("created_at", { ascending: false }),
      supabase.from("saved_requests").select("request_id").eq("request_id", id).maybeSingle(),
      supabase.from("request_payment_details").select("consumer_ref, account_title, payment_note").eq("request_id", id).maybeSingle(),
    ]);
    const reservations = (res.data ?? []) as ReservationRow[];
    activeRes = reservations.find((x) => x.status === "active" && new Date(x.expires_at).getTime() > nowMs()) ?? null;
    const lastExpired = reservations.find((x) => x.status === "expired");
    if (!activeRes && r.lifecycle === "open" && lastExpired) {
      const ended = reservations.length ? new Date((lastExpired as unknown as { ended_at: string | null }).ended_at ?? lastExpired.expires_at).getTime() : 0;
      if (nowMs() - ended < 24 * 3600 * 1000) lateRes = lastExpired;
    }
    myReview = rev.data; myInfos = (info.data ?? []) as InfoRequestRow[]; myPayments = (pay.data ?? []) as PaymentRow[];
    saved = !!sv.data; details = det.data;
  }
  const canOpenOriginals = !!activeRes || myPayments.length > 0 || (serverEnv().DONOR_ORIGINAL_ACCESS === "verified" && !!session?.emailConfirmed && ["open", "reserved", "payment_pending"].includes(r.lifecycle));
  const payRes = activeRes ?? lateRes;
  const paying = !!payRes && remaining > 0;
  const reservedByOther = r.lifecycle === "reserved" && !activeRes;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <Link href="/requests" className="text-sm font-semibold text-forest-700 underline underline-offset-4">← {t("nav.browse")}</Link>
      <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_380px]">
        {/* ---------- main column ---------- */}
        <div className="min-w-0 space-y-8">
          <header>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="green">{t(`ut.${r.utility_type}`)}</Badge>
              <LifecycleBadge status={r.lifecycle} t={t} />
              <VerificationBadge status={r.verification_status} t={t} />
            </div>
            <h1 className="mt-3 font-display text-3xl font-semibold leading-tight text-forest-900 sm:text-4xl">{r.title}</h1>
            <p className="mt-2 text-sm text-muted">{t("pub.detail.by", { name: r.requester_first_name })}</p>
            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
              <div className="flex items-center gap-1.5"><MapPin className="size-4" aria-hidden /><dt className="sr-only">{t("common.city")}</dt><dd>{r.city} · {r.provider_name}</dd></div>
              <div className="flex items-center gap-1.5"><CalendarClock className="size-4" aria-hidden /><dt className="sr-only">{t("common.due")}</dt><dd>{formatDate(r.due_date, locale)}</dd></div>
            </dl>
          </header>

          <section aria-labelledby="about-h">
            <h2 id="about-h" className="font-display text-xl font-semibold text-forest-900">{t("pub.detail.about")}</h2>
            <p className="mt-2 whitespace-pre-line text-lg leading-relaxed">{r.description}</p>
          </section>

          <section aria-labelledby="docs-h">
            <h2 id="docs-h" className="font-display text-xl font-semibold text-forest-900">{t("pub.detail.preview")}</h2>
            {previews.length ? (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                {previews.map((d) => (
                  <figure key={d.id} className="overflow-hidden rounded-lg border border-line bg-paper">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/documents/${d.id}/signed?type=preview`} alt={t("pub.detail.preview")} loading="lazy" className="w-full" />
                    {canOpenOriginals ? (
                      <figcaption className="border-t border-line p-3"><a href={`/api/documents/${d.id}/signed?type=original`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-forest-700 underline underline-offset-4"><ExternalLink className="size-4" aria-hidden />{t("doc.openOriginal")}</a></figcaption>
                    ) : null}
                  </figure>
                ))}
              </div>
            ) : null}
            {pdfBills.map((d) => (
              <div key={d.id} className="mt-3 flex items-start gap-3 rounded-lg border border-line bg-paper p-4">
                <FileText className="mt-0.5 size-5 text-forest-600" aria-hidden />
                <div className="min-w-0 text-sm"><p className="truncate font-semibold">{d.display_name}</p><p className="text-muted">{t("doc.pdfNoPreview")}</p>
                  {canOpenOriginals ? <a href={`/api/documents/${d.id}/signed?type=original`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-9 items-center gap-1.5 font-semibold text-forest-700 underline underline-offset-4"><ExternalLink className="size-4" aria-hidden />{t("doc.openOriginal")}</a> : null}
                </div>
              </div>
            ))}
            {!previews.length && !pdfBills.length ? <p className="mt-2 text-muted">{t("doc.noPreview")}</p> : null}
            {!canOpenOriginals && isDonor && r.lifecycle === "open" ? <p className="mt-3 flex items-center gap-2 text-sm text-muted"><Lock className="size-4" aria-hidden />{t("doc.originalReserved")}</p> : null}
            {canOpenOriginals ? docs.filter((d) => d.kind === "supporting").map((d) => (
              <a key={d.id} href={`/api/documents/${d.id}/signed?type=original`} target="_blank" rel="noopener noreferrer" className="mt-3 flex min-h-11 items-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-semibold text-forest-800 hover:bg-forest-50"><FileText className="size-4" aria-hidden />{d.display_name} · {t("doc.kind.supporting")}</a>
            )) : null}
          </section>
        </div>

        {/* ---------- sidebar ---------- */}
        <aside className="space-y-6">
          <Card>
            <CardBody className="pt-5">
              <p className="font-display text-3xl font-semibold text-forest-900">{formatPKR(remaining, locale)}</p>
              <p className="text-sm text-muted">{t("common.remaining")} · {t("common.amount")} {formatPKR(r.amount_due, locale)}</p>
              <Meter className="mt-4" percent={pct} label={t("pub.detail.progress", { p: pct })} />
              <p className="mt-1.5 text-sm text-muted">{t("pub.detail.progress", { p: pct })}</p>
            </CardBody>
          </Card>

          {/* ----- action panel ----- */}
          <Card>
            <CardBody className="space-y-5 pt-5">
              {!session ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted">{t("pub.detail.loginToHelp")}</p>
                  <Button asChild className="w-full"><Link href={`/login?next=/requests/${id}`}>{t("nav.login")}</Link></Button>
                  <Button asChild variant="secondary" className="w-full"><Link href="/register">{t("nav.register")}</Link></Button>
                </div>
              ) : !isDonor ? (
                <p className="text-sm text-muted">{t("pub.detail.loginToHelp")}</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    <SaveButton requestId={id} saved={saved} />
                    <MessageButton requestId={id} />
                  </div>

                  {activeRes ? (
                    <div className="space-y-3 rounded-md bg-forest-50 p-3">
                      <p className="text-sm font-semibold text-forest-900">{t("dn.reserved", { t: formatDateTime(activeRes.expires_at, locale) })}</p>
                      <Countdown expiresAt={activeRes.expires_at} />
                      <ReleaseButton reservationId={activeRes.id} />
                    </div>
                  ) : r.lifecycle === "open" ? (
                    <ReserveButton requestId={id} minutes={minutes} />
                  ) : reservedByOther ? (
                    <Alert variant="warning">{t("dn.reservedOther")}</Alert>
                  ) : null}

                  {lateRes && !activeRes ? <Alert variant="info">{t("dn.lateEvidence")}</Alert> : null}

                  {payRes && details ? (
                    <div className="space-y-2 rounded-md border border-forest-200 bg-paper p-3">
                      <h3 className="font-display text-lg font-semibold text-forest-900">{t("dn.payTo")}</h3>
                      <dl className="space-y-1 text-sm">
                        <div className="flex justify-between gap-3"><dt className="text-muted">{t("common.provider")}</dt><dd className="font-semibold">{r.provider_name}</dd></div>
                        <div className="flex justify-between gap-3"><dt className="text-muted">{t("dn.consumerRef")}</dt><dd className="font-mono font-semibold" dir="ltr">{details.consumer_ref}</dd></div>
                        {details.account_title ? <div className="flex justify-between gap-3"><dt className="text-muted">{t("dn.accountTitle")}</dt><dd className="font-semibold">{details.account_title}</dd></div> : null}
                        <div className="flex justify-between gap-3"><dt className="text-muted">{t("common.remaining")}</dt><dd className="font-semibold">{formatPKR(remaining, locale)}</dd></div>
                      </dl>
                      {details.payment_note ? <p className="text-sm text-muted">{details.payment_note}</p> : null}
                      <details className="text-sm">
                        <summary className="cursor-pointer font-semibold text-forest-700">{t("dn.howToPay")}</summary>
                        <ul className="mt-2 list-disc space-y-1 ps-5 text-muted"><li>{t("dn.pay.easypaisa")}</li><li>{t("dn.pay.jazzcash")}</li><li>{t("dn.pay.bank_app")}</li></ul>
                      </details>
                      <Alert variant="warning">{t("dn.pay.note")}</Alert>
                    </div>
                  ) : null}

                  {["open", "reserved"].includes(r.lifecycle) ? (
                    <>
                      <ReviewPanel requestId={id} reviewed={!!myReview} satisfied={myReview?.status === "satisfied"} />
                      <AskInfoForm requestId={id} />
                    </>
                  ) : null}

                  {myInfos.length ? (
                    <ul className="space-y-3">
                      {myInfos.map((i) => (
                        <li key={i.id} className="rounded-md border border-line p-3 text-sm">
                          <p className="font-semibold">{i.question}</p>
                          <p className={i.response ? "mt-1 text-muted" : "mt-1 italic text-muted"}>{i.response ?? t("vs.info_requested")}</p>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {paying && payRes ? <PaymentForm requestId={id} reservationId={payRes.id} remaining={remaining} /> : null}

                  {myPayments.map((p) => (
                    <div key={p.id} className="space-y-1 rounded-md border border-line p-3 text-sm">
                      <div className="flex items-center justify-between gap-2"><span className="font-semibold">{formatPKR(p.amount, locale)}</span><PaymentBadge status={p.status} t={t} /></div>
                      <p className="text-muted">{t(`pm.${p.method}`)} · {p.transaction_ref}</p>
                      {p.status === "disputed" ? <><p className="text-danger">{p.dispute_reason}</p>{!p.donor_response ? <DisputeResponseForm paymentId={p.id} /> : <p className="text-muted">{p.donor_response}</p>}</> : null}
                    </div>
                  ))}
                  <ReportForm requestId={id} />
                </>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t("pub.detail.timeline")}</CardTitle></CardHeader>
            <CardBody>
              <VerificationTimeline status={r.verification_status} t={t} />
              <p className="mt-3 text-sm text-muted">{t("vs.reviewedBy", { n: r.review_count })} · {t("vs.satisfiedBy", { n: r.satisfied_count })}</p>
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}
