"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { ResultAlert, useAction } from "@/components/forms/use-action";
import { useT } from "@/lib/i18n/client";
import { cancelRequestAction, publishRequestAction } from "@/actions/requests";
import { answerInfoAction, confirmPaymentAction, disputePaymentAction } from "@/actions/requester";
import type { MessageKey } from "@/lib/i18n";

export function PublishButton({ requestId }: { requestId: string }) {
  const { t } = useT();
  const a = useAction();
  return (<div className="space-y-2"><ResultAlert result={a.result} /><Button disabled={a.pending} onClick={() => a.run(() => publishRequestAction(requestId))}>{t("rf.publish")}</Button></div>);
}

export function CancelRequestButton({ requestId }: { requestId: string }) {
  const { t } = useT();
  const a = useAction();
  const [sure, setSure] = useState(false);
  return (
    <div className="space-y-2">
      <ResultAlert result={a.result} />
      {!sure ? <Button variant="outlineDanger" onClick={() => setSure(true)}>{t("rf.cancelRequest")}</Button> : (
        <div className="flex flex-wrap gap-2">
          <Button variant="danger" disabled={a.pending} onClick={() => a.run(() => cancelRequestAction(requestId))}>{t("common.confirm")}</Button>
          <Button variant="secondary" onClick={() => setSure(false)}>{t("common.cancel")}</Button>
        </div>
      )}
    </div>
  );
}

export function RemoveDocumentButton({ id }: { id: string }) {
  const { t } = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <Button variant="ghost" size="sm" disabled={busy} aria-label={t("doc.remove")} onClick={async () => {
        setBusy(true); setErr(null);
        try {
          const res = await fetch(`/api/documents/${id}`, { method: "DELETE", credentials: "same-origin" });
          const j = (await res.json().catch(() => ({}))) as { ok?: boolean; code?: string };
          if (!res.ok || !j.ok) { const k = `err.${j.code ?? "unknown"}` as MessageKey; setErr(t(k) !== k ? t(k) : t("common.error")); } else router.refresh();
        } catch { setErr(t("common.error")); } finally { setBusy(false); }
      }}><Trash2 className="size-4" aria-hidden />{t("doc.remove")}</Button>
      {err ? <span role="alert" className="text-sm text-danger">{err}</span> : null}
    </>
  );
}

export function AnswerForm({ infoId }: { infoId: string }) {
  const { t } = useT();
  const a = useAction();
  const [text, setText] = useState("");
  return (
    <div className="space-y-2">
      <Field id={`ans-${infoId}`} label={t("rq.answer")}><Textarea id={`ans-${infoId}`} rows={3} value={text} maxLength={2000} placeholder={t("rq.answerPlaceholder")} onChange={(e) => setText(e.target.value)} /></Field>
      <Button disabled={a.pending || text.trim().length < 2} onClick={() => a.run(() => answerInfoAction({ infoId, response: text }))}>{t("common.send")}</Button>
      <ResultAlert result={a.result} />
    </div>
  );
}

export function PaymentDecision({ paymentId }: { paymentId: string }) {
  const { t } = useT();
  const a = useAction();
  const b = useAction();
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <div className="space-y-3">
      <Alert variant="info">{t("rq.confirmHint")}</Alert>
      <ResultAlert result={a.result} />
      {!disputing ? (
        <div className="flex flex-wrap gap-2">
          <Button disabled={a.pending} onClick={() => a.run(() => confirmPaymentAction({ paymentId }))}>{t("rq.confirmPayment")}</Button>
          <Button variant="outlineDanger" onClick={() => setDisputing(true)}>{t("rq.disputePayment")}</Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Field id={`dp-${paymentId}`} label={t("rq.disputeReason")}><Textarea id={`dp-${paymentId}`} rows={3} value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} /></Field>
          <ResultAlert result={b.result} />
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" disabled={b.pending || reason.trim().length < 10} onClick={() => b.run(() => disputePaymentAction({ paymentId, reason }))}>{t("rq.disputePayment")}</Button>
            <Button variant="secondary" onClick={() => setDisputing(false)}>{t("common.cancel")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
