"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ResultAlert, useAction } from "@/components/forms/use-action";
import { useT } from "@/lib/i18n/client";
import { moderateRequestAction, resolveDisputeAction, resolveReportAction, setRoleAction, suspendUserAction } from "@/actions/admin";

export function UserControls({ userId, role, suspended, isSelf }: { userId: string; role: string; suspended: boolean; isSelf: boolean }) {
  const { t } = useT();
  const a = useAction();
  const [newRole, setNewRole] = useState(role);
  const [reason, setReason] = useState("");
  if (isSelf) return <span className="text-sm text-muted">—</span>;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`role-${userId}`}>{t("auth.role")}</label>
        <Select id={`role-${userId}`} className="w-auto min-h-9 py-1 text-sm" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
          <option value="requester">{t("common.requester")}</option><option value="donor">{t("common.donor")}</option><option value="admin">{t("common.admin")}</option>
        </Select>
        {newRole !== role ? <Button size="sm" disabled={a.pending} onClick={() => a.run(() => setRoleAction(userId, newRole as "requester" | "donor" | "admin"))}>{t("common.save")}</Button> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {!suspended ? <Input aria-label={t("common.reason")} className="min-h-9 w-40 py-1 text-sm" placeholder={t("common.reason")} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} /> : null}
        <Button size="sm" variant={suspended ? "secondary" : "outlineDanger"} disabled={a.pending} onClick={() => a.run(() => suspendUserAction(userId, !suspended, reason))}>{suspended ? t("ad.unsuspend") : t("ad.suspend")}</Button>
      </div>
      <ResultAlert result={a.result && !a.result.ok ? a.result : null} />
    </div>
  );
}

export function RequestAdminControls({ requestId, lifecycle, flagged }: { requestId: string; lifecycle: string; flagged: boolean }) {
  const { t } = useT();
  const a = useAction();
  return (
    <div className="flex flex-wrap gap-2">
      {lifecycle === "removed" ? <Button size="sm" variant="secondary" disabled={a.pending} onClick={() => a.run(() => moderateRequestAction(requestId, "restore"))}>{t("ad.restore")}</Button>
        : !["completed", "cancelled", "draft"].includes(lifecycle) ? <Button size="sm" variant="outlineDanger" disabled={a.pending} onClick={() => a.run(() => moderateRequestAction(requestId, "remove"))}>{t("ad.remove")}</Button> : null}
      {flagged ? <Button size="sm" variant="ghost" disabled={a.pending} onClick={() => a.run(() => moderateRequestAction(requestId, "unflag"))}>{t("ad.unflag")}</Button> : null}
      <ResultAlert result={a.result && !a.result.ok ? a.result : null} />
    </div>
  );
}

export function ReportControls({ reportId, status }: { reportId: string; status: string }) {
  const { t } = useT();
  const a = useAction();
  const [note, setNote] = useState("");
  if (status === "actioned" || status === "dismissed") return null;
  return (
    <div className="space-y-2">
      <Input aria-label={t("ad.note")} placeholder={t("ad.note")} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        {status === "open" ? <Button size="sm" variant="secondary" disabled={a.pending} onClick={() => a.run(() => resolveReportAction(reportId, "reviewing", note))}>{t("ad.reviewing")}</Button> : null}
        <Button size="sm" disabled={a.pending} onClick={() => a.run(() => resolveReportAction(reportId, "actioned", note))}>{t("ad.action")}</Button>
        <Button size="sm" variant="ghost" disabled={a.pending} onClick={() => a.run(() => resolveReportAction(reportId, "dismissed", note))}>{t("ad.dismiss")}</Button>
      </div>
      <ResultAlert result={a.result && !a.result.ok ? a.result : null} />
    </div>
  );
}

export function DisputeControls({ paymentId }: { paymentId: string }) {
  const { t } = useT();
  const a = useAction();
  const [note, setNote] = useState("");
  return (
    <div className="space-y-2">
      <Input aria-label={t("ad.note")} placeholder={t("ad.note")} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={a.pending || note.trim().length < 3} onClick={() => a.run(() => resolveDisputeAction(paymentId, true, note))}>{t("ad.resolveValid")}</Button>
        <Button size="sm" variant="danger" disabled={a.pending || note.trim().length < 3} onClick={() => a.run(() => resolveDisputeAction(paymentId, false, note))}>{t("ad.resolveInvalid")}</Button>
      </div>
      <ResultAlert result={a.result && !a.result.ok ? a.result : null} />
    </div>
  );
}
