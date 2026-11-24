"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { profileSchema } from "@/lib/validation";
import { updateProfileAction } from "@/actions/profile";
import { useT } from "@/lib/i18n/client";
import { ResultAlert, useAction } from "./use-action";

type V = z.input<typeof profileSchema>;
export function ProfileForm({ initial }: { initial: V }) {
  const { t } = useT();
  const a = useAction();
  const { register, handleSubmit, formState: { errors } } = useForm<V>({ resolver: zodResolver(profileSchema), defaultValues: initial });
  return (
    <form noValidate className="space-y-4" onSubmit={handleSubmit((v) => a.run(() => updateProfileAction(v)))}>
      <ResultAlert result={a.result} />
      <Field id="fullName" label={t("auth.fullName")} error={errors.fullName && t("err.validation")}><Input id="fullName" autoComplete="name" aria-invalid={!!errors.fullName} {...register("fullName")} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="phone" label={t("st.phone")} error={errors.phone && t("err.validation")}><Input id="phone" type="tel" inputMode="tel" autoComplete="tel" aria-invalid={!!errors.phone} {...register("phone")} /></Field>
        <Field id="city" label={t("common.city")}><Input id="city" autoComplete="address-level2" {...register("city")} /></Field>
      </div>
      <Field id="bio" label={t("st.bio")} optional={t("common.optional")}><Textarea id="bio" rows={3} maxLength={500} {...register("bio")} /></Field>
      <Field id="locale" label={t("st.language")}>
        <Select id="locale" {...register("locale")}><option value="en">English</option><option value="ur">اردو</option></Select>
      </Field>
      <label className="flex items-start gap-3 rounded-md border border-line bg-paper p-3 text-sm">
        <input type="checkbox" className="mt-1 size-4 accent-[#1f4d3a]" {...register("emailNotifications")} />
        <span><span className="block font-semibold">{t("st.emailNotifications")}</span><span className="text-muted">{t("st.emailNotifications.help")}</span></span>
      </label>
      <Button type="submit" disabled={a.pending}>{a.pending ? t("common.loading") : t("common.save")}</Button>
    </form>
  );
}
