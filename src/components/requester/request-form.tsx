"use client";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { requestSchema, UTILITY_TYPES } from "@/lib/validation";
import { createRequestAction, updateRequestAction } from "@/actions/requests";
import { useT } from "@/lib/i18n/client";
import { ResultAlert, useAction } from "@/components/forms/use-action";

type V = z.input<typeof requestSchema>;

export function RequestForm({ requestId, initial, locked }: { requestId?: string; initial?: Partial<V>; locked?: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const a = useAction();
  const { register, handleSubmit, formState: { errors } } = useForm<V>({
    resolver: zodResolver(requestSchema),
    defaultValues: { utilityType: "electricity", hardshipNote: "", accountTitle: "", paymentNote: "", ...initial },
  });
  const err = (k: keyof V) => (errors[k] ? t("err.validation") : undefined);
  return (
    <form noValidate className="space-y-4" onSubmit={handleSubmit((v) => {
      if (requestId) a.run(() => updateRequestAction(requestId, v));
      else a.run(() => createRequestAction(v), (r) => { if (r.ok && r.data) router.push(`/dashboard/requester/requests/${r.data.id}`); });
    })}>
      <ResultAlert result={a.result} />
      {locked ? <Alert variant="warning">{t("rf.locked")}</Alert> : null}
      <Field id="title" label={t("rf.title")} error={err("title")}><Input id="title" maxLength={120} aria-invalid={!!errors.title} {...register("title")} /></Field>
      <Field id="description" label={t("rf.description")} error={err("description")}><Textarea id="description" rows={5} maxLength={2000} aria-invalid={!!errors.description} {...register("description")} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="utilityType" label={t("rf.utility")}>
          <Select id="utilityType" disabled={locked} {...register("utilityType")}>{UTILITY_TYPES.map((u) => <option key={u} value={u}>{t(`ut.${u}`)}</option>)}</Select>
        </Field>
        <Field id="providerName" label={t("rf.provider")} error={err("providerName")}><Input id="providerName" maxLength={80} disabled={locked} aria-invalid={!!errors.providerName} {...register("providerName")} /></Field>
        <Field id="city" label={t("rf.city")} error={err("city")}><Input id="city" maxLength={80} aria-invalid={!!errors.city} {...register("city")} /></Field>
        <Field id="amountDue" label={t("rf.amount")} error={err("amountDue")}><Input id="amountDue" type="number" inputMode="decimal" min={1} max={500000} step="0.01" disabled={locked} aria-invalid={!!errors.amountDue} {...register("amountDue")} /></Field>
        <Field id="dueDate" label={t("rf.dueDate")} error={err("dueDate")}><Input id="dueDate" type="date" disabled={locked} aria-invalid={!!errors.dueDate} {...register("dueDate")} /></Field>
      </div>
      <Field id="hardshipNote" label={t("rf.hardship")} optional={t("common.optional")}><Textarea id="hardshipNote" rows={3} maxLength={1000} {...register("hardshipNote")} /></Field>
      <fieldset className="space-y-4 rounded-lg border border-line bg-forest-50/50 p-4">
        <Field id="consumerRef" label={t("rf.consumerRef")} hint={t("rf.consumerRef.help")} error={err("consumerRef")}><Input id="consumerRef" maxLength={40} autoComplete="off" dir="ltr" aria-invalid={!!errors.consumerRef} {...register("consumerRef")} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="accountTitle" label={t("rf.accountTitle")}><Input id="accountTitle" maxLength={120} {...register("accountTitle")} /></Field>
          <Field id="paymentNote" label={t("rf.paymentNote")}><Input id="paymentNote" maxLength={300} {...register("paymentNote")} /></Field>
        </div>
      </fieldset>
      <Button type="submit" disabled={a.pending}>{a.pending ? t("common.loading") : requestId ? t("rf.update") : t("rf.create")}</Button>
    </form>
  );
}
