"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, BookmarkCheck, Flag, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { useT } from "@/lib/i18n/client";
import { ResultAlert, useAction } from "@/components/forms/use-action";
import { DocumentUpload } from "@/components/forms/document-upload";
import {
  askInfoAction, cancelReservationAction, markReviewedAction, markSatisfiedAction, reportAction,
  reserveAction, respondDisputeAction, startThreadAction, submitPaymentAction, toggleSaveAction,
} from "@/actions/donor";
import { formatPKR } from "@/lib/utils";

export function ReserveButton({ requestId, minutes }: { requestId: string; minutes: number }) {
  const { t } = useT();
  const a = useAction();
  return (
    <div className="space-y-2">
      <ResultAlert result={a.result} />
      <Button size="lg" className="w-full" disabled={a.pending} onClick={() => a.run(() => reserveAction(requestId))}>
        {a.pending ? t("common.loading") : t("dn.reserve", { m: minutes })}
      </Button>
      <p className="text-sm text-muted">{t("dn.reservedHelp")}</p>
    </div>
  );
}

export function ReleaseButton({ reservationId }: { reservationId: string }) {
  const { t } = useT();
  const a = useAction();
  return (
    <>
      <ResultAlert result={a.result} />
      <Button variant="outlineDanger" disabled={a.pending} onClick={() => a.run(() => cancelReservationAction(reservationId))}>{t("dn.cancelReservation")}</Button>
    </>
  );
}

export function SaveButton({ requestId, saved }: { requestId: string; saved: boolean }) {
  const { t } = useT();
  const a = useAction();
  return (
    <Button variant="secondary" size="sm" disabled={a.pending} aria-pressed={saved} onClick={() => a.run(() => toggleSaveAction(requestId, !saved))}>
      {saved ? <BookmarkCheck className="size-4" aria-hidden /> : <Bookmark className="size-4" aria-hidden />}
      {saved ? t("dn.saved") : t("dn.save")}
    </Button>
  );
}

export function MessageButton({ requestId }: { requestId: string }) {
  const { t } = useT();
  const router = useRouter();
  const a = useAction();
  return (
    <>
      <Button variant="secondary" size="sm" disabled={a.pending}
        onClick={() => a.run(() => startThreadAction(requestId), (r) => { if (r.ok && r.data) router.push(`/dashboard/messages/${r.data.threadId}`); })}>
        <MessageSquare className="size-4" aria-hidden />{t("dn.messageRequester")}
      </Button>
      {a.result && !a.result.ok ? <p role="alert" className="text-sm text-danger">{a.result.error}</p> : null}
    </>
  );
}

export function ReviewPanel({ requestId, reviewed, satisfied }: { requestId: string; reviewed: boolean; satisfied: boolean }) {
  const { t } = useT();
  const a = useAction();
  const b = useAction();
  const [note, setNote] = useState("");
  return (
    <div className="space-y-3">
      <h3 className="font-display text-lg font-semibold text-forest-900">{t("dn.activity")}</h3>
      {!reviewed ? (
        <div className="space-y-2">
          <Field id="review-note" label={t("dn.markReviewed.note")} optional={t("common.optional")}>
            <Textarea id="review-note" rows={2} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Button disabled={a.pending} onClick={() => a.run(() => markReviewedAction({ requestId, note }))}>{t("dn.markReviewed")}</Button>
          <ResultAlert result={a.result} />
        </div>
      ) : !satisfied ? (
        <div className="space-y-2">
          <Alert variant="success">{t("dn.reviewed")}</Alert>
          <Button variant="secondary" disabled={b.pending} onClick={() => b.run(() => markSatisfiedAction(requestId))}>{t("dn.markSatisfied")}</Button>
          <ResultAlert result={b.result} />
        </div>
      ) : <Alert variant="success">{t("dn.satisfied")}</Alert>}
    </div>
  );
}

export function AskInfoForm({ requestId }: { requestId: string }) {
  const { t } = useT();
  const a = useAction();
  const [q, setQ] = useState("");
  return (
    <div className="space-y-2">
      <Field id="ask" label={t("dn.askInfo")}>
        <Textarea id="ask" rows={3} value={q} maxLength={1000} placeholder={t("dn.askInfo.placeholder")} onChange={(e) => setQ(e.target.value)} />
      </Field>
      <Button variant="secondary" disabled={a.pending || q.trim().length < 10} onClick={() => a.run(() => askInfoAction({ requestId, question: q }), () => setQ(""))}>{t("common.send")}</Button>
      <ResultAlert result={a.result} />
    </div>
  );
}

export function ReportForm({ requestId }: { requestId: string }) {
  const { t } = useT();
  const a = useAction();
  const [reason, setReason] = useState("fake_bill");
  const [details, setDetails] = useState("");
  return (
    <details className="rounded-md border border-line bg-paper p-3">
      <summary className="flex min-h-9 cursor-pointer items-center gap-2 text-sm font-semibold text-danger"><Flag className="size-4" aria-hidden />{t("dn.report")}</summary>
      <div className="mt-3 space-y-3">
        <Field id="report-reason" label={t("dn.report.reason")}>
          <Select id="report-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
            {(["fake_bill", "altered_bill", "duplicate", "inappropriate", "harassment", "other"] as const).map((r) => <option key={r} value={r}>{t(`rp.${r}`)}</option>)}
          </Select>
        </Field>
        <Field id="report-details" label={t("dn.report.details")} optional={t("common.optional")}>
          <Textarea id="report-details" rows={3} value={details} maxLength={1000} onChange={(e) => setDetails(e.target.value)} />
        </Field>
        <Button variant="outlineDanger" disabled={a.pending} onClick={() => a.run(() => reportAction({ requestId, reason, details }))}>{t("common.submit")}</Button>
        <ResultAlert result={a.result} />
      </div>
    </details>
  );
}

export function PaymentForm({ requestId, reservationId, remaining }: { requestId: string; reservationId: string; remaining: number }) {
  const { t, locale } = useT();
  const a = useAction();
  const router = useRouter();
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [amount, setAmount] = useState(String(remaining));
  const [method, setMethod] = useState("easypaisa");
  const [txRef, setTxRef] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (submitted) return <Alert variant="success">{t("dn.paymentSent")}</Alert>;
  return (
    <div className="space-y-4">
      <h3 className="font-display text-lg font-semibold text-forest-900">{t("dn.submitPayment")}</h3>
      <DocumentUpload requestId={requestId} kind="receipt" label={t("dn.receipt")} onUploaded={setReceiptId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="pay-amount" label={`${t("common.amount")} (≤ ${formatPKR(remaining, locale)})`}>
          <Input id="pay-amount" type="number" inputMode="decimal" min={1} max={remaining} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field id="pay-method" label={t("dn.method")}>
          <Select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value)}>
            {(["easypaisa", "jazzcash", "bank_app", "other"] as const).map((m) => <option key={m} value={m}>{t(`pm.${m}`)}</option>)}
          </Select>
        </Field>
        <Field id="pay-ref" label={t("dn.txRef")}>
          <Input id="pay-ref" value={txRef} maxLength={64} autoComplete="off" onChange={(e) => setTxRef(e.target.value)} />
        </Field>
        <Field id="pay-date" label={t("dn.paidAt")}>
          <Input id="pay-date" type="datetime-local" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        </Field>
      </div>
      <ResultAlert result={a.result} />
      <Button size="lg" className="w-full" disabled={a.pending || !receiptId || !txRef || !paidAt}
        onClick={() => a.run(() => submitPaymentAction({
          reservationId, amount, method, transactionRef: txRef.trim(), paidAt: new Date(paidAt).toISOString(), receiptDocumentId: receiptId,
        }), () => { setSubmitted(true); router.refresh(); })}>
        {a.pending ? t("common.loading") : t("dn.submitPayment")}
      </Button>
      {!receiptId ? <p className="text-sm text-muted">{t("dn.receipt")}</p> : null}
    </div>
  );
}

export function DisputeResponseForm({ paymentId }: { paymentId: string }) {
  const { t } = useT();
  const a = useAction();
  const [text, setText] = useState("");
  return (
    <div className="space-y-2">
      <Field id={`dr-${paymentId}`} label={t("dn.disputeResponse")}>
        <Textarea id={`dr-${paymentId}`} rows={3} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} />
      </Field>
      <Button disabled={a.pending || text.trim().length < 5} onClick={() => a.run(() => respondDisputeAction({ paymentId, response: text }))}>{t("dn.respondDispute")}</Button>
      <ResultAlert result={a.result} />
    </div>
  );
}
