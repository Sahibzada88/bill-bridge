import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ExternalLink, FileText } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";
import { formatDateTime, formatPKR, progressPct } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Meter } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { LifecycleBadge, PaymentBadge, VerificationBadge, VerificationTimeline } from "@/components/status";
import { RequestForm } from "@/components/requester/request-form";
import { AnswerForm, CancelRequestButton, PaymentDecision, PublishButton, RemoveDocumentButton } from "@/components/requester/request-controls";
import { DocumentUpload } from "@/components/forms/document-upload";
import { Countdown } from "@/components/countdown";
import type { DocumentRow, InfoRequestRow, PaymentRow, RequestEvent, RequestRow, ReservationRow } from "@/types";

export const metadata = { title: "Manage request" };

export default async function ManageRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const s = await requireRole("requester");
  const { t, locale } = await getT();
  const supabase = await createClient();
  await supabase.rpc("release_expired_reservations");

  const { data: reqData } = await supabase.from("requests").select("*").eq("id", id).maybeSingle(); // RLS: own only
  if (!reqData) notFound();
  const r = reqData as RequestRow;

  const [docs, infos, pays, res, events, logs, reviews, details] = await Promise.all([
    supabase.from("documents").select("*").eq("request_id", id).eq("status", "active").neq("kind", "receipt").order("created_at"),
    supabase.from("info_requests").select("*").eq("request_id", id).order("created_at", { ascending: false }),
    supabase.from("payments").select("*").eq("request_id", id).order("created_at", { ascending: false }),
    supabase.from("reservations").select("*").eq("request_id", id).eq("status", "active").maybeSingle(),
    supabase.from("request_events").select("*").eq("request_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("document_access_logs").select("id, document_id, accessor_id, access_type, created_at").eq("request_id", id).order("created_at", { ascending: false }).limit(30),
    supabase.from("donor_reviews").select("status").eq("request_id", id),
    supabase.from("request_payment_details").select("consumer_ref, account_title, payment_note").eq("request_id", id).maybeSingle(),
  ]);
  const documents = (docs.data ?? []) as DocumentRow[];
  const infoRows = (infos.data ?? []) as InfoRequestRow[];
  const payments = (pays.data ?? []) as PaymentRow[];
  const activeRes = res.data as ReservationRow | null;
  const eventRows = (events.data ?? []) as RequestEvent[];

  const accessorIds = [...new Set((logs.data ?? []).map((l) => l.accessor_id).filter(Boolean))] as string[];
  const { data: names } = accessorIds.length ? await supabase.from("profile_names").select("id, display_name").in("id", accessorIds) : { data: [] as { id: string; display_name: string }[] };
  const nameOf = new Map((names ?? []).map((n) => [n.id, n.display_name]));

  const pct = progressPct(r.amount_paid, r.amount_due);
  const editable = r.lifecycle === "draft" || (r.lifecycle === "open" && !activeRes);
  const reviewCount = reviews.data?.length ?? 0;
  const financialLocked = r.lifecycle === "open" && (reviewCount > 0 || infoRows.length > 0 || payments.length > 0);
  const hasBill = documents.some((d) => d.kind === "bill");
  const canAddBill = r.lifecycle === "draft" || (r.lifecycle === "open" && reviewCount === 0);
  const canAddSupporting = ["draft", "open", "reserved"].includes(r.lifecycle);
  const toConfirm = payments.filter((p) => p.status === "submitted");
  const openQuestions = infoRows.filter((i) => i.status === "open");
  const publicLink = ["open", "reserved", "payment_pending", "completed"].includes(r.lifecycle);

  return (
    <div className="space-y-6">
      <Link href="/dashboard/requester" className="text-sm font-semibold text-forest-700 underline underline-offset-4">← {t("rf.myRequests")}</Link>
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2"><LifecycleBadge status={r.lifecycle} t={t} />{r.lifecycle !== "draft" ? <VerificationBadge status={r.verification_status} t={t} /> : null}{r.flagged ? <Badge tone="red">{t("ad.flagged")}</Badge> : null}</div>
        <h1 className="font-display text-3xl font-semibold text-forest-900">{r.title}</h1>
        <div className="max-w-md"><div className="mb-1 flex justify-between text-sm"><span>{formatPKR(r.amount_paid, locale)}</span><span className="text-muted">{formatPKR(r.amount_due, locale)}</span></div><Meter percent={pct} label={`${pct}%`} /></div>
        {publicLink ? <Link href={`/requests/${id}?view=public`} className="text-sm font-semibold text-forest-700 underline underline-offset-4">{t("pub.detail.preview")} →</Link> : null}
      </header>

      {activeRes ? <Alert variant="info"><span className="me-2">{t("rq.reservationActive", { t: formatDateTime(activeRes.expires_at, locale) })}</span><Countdown expiresAt={activeRes.expires_at} /></Alert> : null}

      {toConfirm.length ? (
        <Card className="border-warn"><CardHeader><CardTitle>{t("rq.payments")}</CardTitle></CardHeader><CardBody className="space-y-5">
          {toConfirm.map((p) => (
            <div key={p.id} className="space-y-3 rounded-md bg-warn-soft/50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-display text-xl font-semibold">{formatPKR(p.amount, locale)}</span><PaymentBadge status={p.status} t={t} /></div>
              <p className="text-sm">{t(`pm.${p.method}`)} · <span className="font-mono" dir="ltr">{p.transaction_ref}</span> · {formatDateTime(p.paid_at, locale)}</p>
              <a href={`/api/documents/${p.receipt_document_id}/signed?type=original`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-forest-700 underline underline-offset-4"><ExternalLink className="size-4" aria-hidden />{t("rq.receipt")}</a>
              <PaymentDecision paymentId={p.id} />
            </div>
          ))}
        </CardBody></Card>
      ) : null}

      {openQuestions.length ? (
        <Card className="border-forest-500"><CardHeader><CardTitle>{t("rq.verification")}</CardTitle></CardHeader><CardBody className="space-y-5">
          {openQuestions.map((i) => (<div key={i.id} className="space-y-2"><p className="font-semibold">{i.question}</p><AnswerForm infoId={i.id} /></div>))}
        </CardBody></Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>{t("pub.detail.about")}</CardTitle></CardHeader><CardBody>
          {editable ? (
            <RequestForm requestId={id} locked={financialLocked} initial={{
              title: r.title, description: r.description, utilityType: r.utility_type, providerName: r.provider_name, city: r.city,
              amountDue: r.amount_due, dueDate: r.due_date, hardshipNote: r.hardship_note ?? "",
              consumerRef: details.data?.consumer_ref ?? "", accountTitle: details.data?.account_title ?? "", paymentNote: details.data?.payment_note ?? "",
            }} />
          ) : <Alert variant="info">{t("err.request_not_editable")}</Alert>}
        </CardBody></Card>

        <div className="space-y-6">
          <Card><CardHeader><CardTitle>{t("doc.upload")}</CardTitle></CardHeader><CardBody className="space-y-4">
            {documents.length ? (
              <ul className="space-y-2">
                {documents.map((d) => (
                  <li key={d.id} className="rounded-md border border-line p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2 text-sm font-semibold"><FileText className="size-4 shrink-0" aria-hidden /><span className="truncate">{d.display_name}</span><Badge>{t(`doc.kind.${d.kind}`)}</Badge></span>
                      <span className="flex items-center gap-1">
                        <a href={`/api/documents/${d.id}/signed?type=original`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center px-2 text-sm font-semibold text-forest-700 underline">{t("doc.openOriginal")}</a>
                        {(d.kind === "bill" ? r.lifecycle === "draft" : canAddSupporting) ? <RemoveDocumentButton id={d.id} /> : null}
                      </span>
                    </div>
                    {d.kind === "bill" ? (d.preview_path
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={`/api/documents/${d.id}/signed?type=preview`} alt={t("pub.detail.preview")} className="mt-2 max-h-56 rounded border border-line" loading="lazy" />
                      : <p className="mt-1 text-xs text-muted">{t("doc.pdfNoPreview")}</p>) : null}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">{t("common.none")}</p>}
            {canAddBill ? <DocumentUpload requestId={id} kind="bill" showRedaction /> : null}
            {canAddSupporting ? <DocumentUpload requestId={id} kind="supporting" /> : null}
          </CardBody></Card>

          {r.lifecycle === "draft" ? (
            <Card><CardBody className="space-y-3 pt-5">
              {!hasBill ? <Alert variant="warning">{t("rf.needBill")}</Alert> : null}
              {!s.profile.phone || !s.profile.city ? <Alert variant="warning">{t("rf.profileIncomplete")}</Alert> : null}
              <PublishButton requestId={id} />
            </CardBody></Card>
          ) : null}
          {["draft", "open", "reserved"].includes(r.lifecycle) && Number(r.amount_paid) === 0 ? <CancelRequestButton requestId={id} /> : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>{t("rq.donorActivity")}</CardTitle></CardHeader><CardBody className="space-y-4">
          <VerificationTimeline status={r.verification_status} t={t} />
          <p className="text-sm text-muted">{t("vs.reviewedBy", { n: reviewCount })}</p>
          {infoRows.filter((i) => i.status !== "open").map((i) => (<div key={i.id} className="rounded-md border border-line p-3 text-sm"><p className="font-semibold">{i.question}</p><p className="mt-1 text-muted">{i.response}</p></div>))}
          <Link href="/dashboard/messages" className="text-sm font-semibold text-forest-700 underline underline-offset-4">{t("nav.messages")} →</Link>
        </CardBody></Card>

        <Card><CardHeader><CardTitle>{t("ad.payments")}</CardTitle></CardHeader><CardBody>
          {payments.length ? (
            <ul className="space-y-3">
              {payments.map((p) => (
                <li key={p.id} className="rounded-md border border-line p-3 text-sm">
                  <div className="flex items-center justify-between gap-2"><span className="font-semibold">{formatPKR(p.amount, locale)}</span><PaymentBadge status={p.status} t={t} /></div>
                  <p className="text-muted">{t(`pm.${p.method}`)} · <span dir="ltr">{p.transaction_ref}</span></p>
                  {p.dispute_reason ? <p className="mt-1 text-danger">{p.dispute_reason}</p> : null}
                  {p.donor_response ? <p className="mt-1 text-muted">↳ {p.donor_response}</p> : null}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">{t("rq.noPayments")}</p>}
        </CardBody></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>{t("rq.history")}</CardTitle></CardHeader><CardBody>
          {eventRows.length ? <ol className="space-y-2 text-sm">{eventRows.map((e) => (<li key={e.id} className="flex flex-wrap justify-between gap-2 border-b border-line pb-2 last:border-0"><span className="font-mono">{e.event_type}{e.to_status ? ` → ${e.to_status}` : ""}</span><span className="text-muted">{formatDateTime(e.created_at, locale)}</span></li>))}</ol> : <p className="text-sm text-muted">{t("common.none")}</p>}
        </CardBody></Card>
        <Card><CardHeader><CardTitle>{t("doc.accessLog")}</CardTitle></CardHeader><CardBody>
          {logs.data?.length ? <ul className="space-y-2 text-sm">{logs.data.map((l) => (<li key={l.id} className="flex flex-wrap justify-between gap-2 border-b border-line pb-2 last:border-0"><span>{l.accessor_id ? (nameOf.get(l.accessor_id) ?? "—") : t("common.none")} · <Badge>{l.access_type}</Badge></span><span className="text-muted">{formatDateTime(l.created_at, locale)}</span></li>))}</ul> : <p className="text-sm text-muted">{t("common.none")}</p>}
        </CardBody></Card>
      </div>
    </div>
  );
}
