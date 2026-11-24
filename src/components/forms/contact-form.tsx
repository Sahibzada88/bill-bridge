"use client";
import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { contactSchema } from "@/lib/validation";
import { contactAction } from "@/actions/contact";
import { useT } from "@/lib/i18n/client";
import { TurnstileWidget } from "./turnstile";
import { ResultAlert, useAction } from "./use-action";
import { publicEnv } from "@/lib/env";

export function ContactForm() {
  const { t } = useT();
  const act = useAction();
  const [token, setToken] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const onToken = useCallback((v: string | null) => setToken(v), []);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<z.input<typeof contactSchema>>({ resolver: zodResolver(contactSchema) });
  return (
    <form noValidate className="space-y-4" onSubmit={handleSubmit((v) => {
      if (publicEnv.turnstileSiteKey && !token) { setMissing(true); return; }
      setMissing(false);
      act.run(() => contactAction(v, token), () => reset());
    })}>
      <ResultAlert result={act.result} />
      <Field id="name" label={t("pub.contact.name")} error={errors.name && t("err.validation")}><Input id="name" autoComplete="name" aria-invalid={!!errors.name} {...register("name")} /></Field>
      <Field id="email" label={t("pub.contact.email")} error={errors.email && t("err.validation")}><Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register("email")} /></Field>
      <Field id="message" label={t("pub.contact.message")} error={errors.message && t("err.validation")}><Textarea id="message" rows={6} aria-invalid={!!errors.message} {...register("message")} /></Field>
      <TurnstileWidget onToken={onToken} />
      {missing ? <Alert variant="error">{t("auth.captcha")}</Alert> : null}
      <Button type="submit" disabled={act.pending}>{act.pending ? t("common.loading") : t("common.send")}</Button>
    </form>
  );
}
