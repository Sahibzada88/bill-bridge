"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { loginSchema, registerSchema, resetRequestSchema, newPasswordSchema } from "@/lib/validation";
import { loginAction, registerAction, requestPasswordResetAction, updatePasswordAction } from "@/actions/auth";
import { useT } from "@/lib/i18n/client";
import { TurnstileWidget } from "./turnstile";
import { ResultAlert, useAction } from "./use-action";
import { publicEnv } from "@/lib/env";
import type { MessageKey } from "@/lib/i18n";

function msg(t: (k: MessageKey) => string, code?: string) {
  if (!code) return undefined;
  if (code === "weak") return t("auth.err.weak");
  if (code === "mismatch") return t("auth.err.mismatch");
  return t("err.validation");
}

function useCaptcha() {
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const onToken = useCallback((v: string | null) => setToken(v), []);
  return { token, onToken, resetKey, reset: () => setResetKey((k) => k + 1), needed: !!publicEnv.turnstileSiteKey };
}

export function LoginForm({ next }: { next?: string }) {
  const { t } = useT();
  const act = useAction();
  const cap = useCaptcha();
  const { register, handleSubmit, formState: { errors } } = useForm<z.input<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });
  const [captchaMissing, setCaptchaMissing] = useState(false);
  return (
    <form noValidate className="space-y-4" onSubmit={handleSubmit((v) => {
      if (cap.needed && !cap.token) { setCaptchaMissing(true); return; }
      setCaptchaMissing(false);
      act.run(async () => { const r = await loginAction(v, cap.token, next); if (r && !r.ok) cap.reset(); return r; });
    })}>
      <ResultAlert result={act.result} />
      <Field id="email" label={t("auth.email")} error={errors.email && t("err.validation")}>
        <Input id="email" type="email" autoComplete="email" inputMode="email" aria-invalid={!!errors.email} {...register("email")} />
      </Field>
      <Field id="password" label={t("auth.password")} error={errors.password && t("err.validation")}>
        <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!errors.password} {...register("password")} />
      </Field>
      <TurnstileWidget onToken={cap.onToken} resetKey={cap.resetKey} />
      {captchaMissing ? <Alert variant="error">{t("auth.captcha")}</Alert> : null}
      <Button type="submit" className="w-full" disabled={act.pending}>{act.pending ? t("common.loading") : t("auth.submit.login")}</Button>
      <p className="text-center text-sm"><Link href="/forgot-password" className="font-semibold text-forest-700 underline underline-offset-4">{t("auth.forgot")}</Link></p>
    </form>
  );
}

export function RegisterForm() {
  const { t } = useT();
  const act = useAction();
  const cap = useCaptcha();
  const [captchaMissing, setCaptchaMissing] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<z.input<typeof registerSchema>>({
    resolver: zodResolver(registerSchema), defaultValues: { role: "donor" },
  });
  if (act.result?.ok) return <Alert variant="success">{act.result.message}</Alert>;
  return (
    <form noValidate className="space-y-4" onSubmit={handleSubmit((v) => {
      if (cap.needed && !cap.token) { setCaptchaMissing(true); return; }
      setCaptchaMissing(false);
      act.run(async () => { const r = await registerAction(v, cap.token); if (!r.ok) cap.reset(); return r; });
    })}>
      <ResultAlert result={act.result} />
      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-sm font-semibold">{t("auth.role")}</legend>
        {(["requester", "donor"] as const).map((r) => (
          <label key={r} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-line bg-paper px-3 has-[:checked]:border-forest-600 has-[:checked]:bg-forest-50">
            <input type="radio" value={r} className="size-4 accent-[#1f4d3a]" {...register("role")} />
            <span className="font-medium">{t(`auth.role.${r}`)}</span>
          </label>
        ))}
      </fieldset>
      <Field id="fullName" label={t("auth.fullName")} error={errors.fullName && t("err.validation")}>
        <Input id="fullName" autoComplete="name" aria-invalid={!!errors.fullName} {...register("fullName")} />
      </Field>
      <Field id="email" label={t("auth.email")} error={errors.email && t("err.validation")}>
        <Input id="email" type="email" autoComplete="email" inputMode="email" aria-invalid={!!errors.email} {...register("email")} />
      </Field>
      <Field id="password" label={t("auth.password")} hint={t("auth.passwordHint")} error={msg(t, errors.password?.message)}>
        <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...register("password")} />
      </Field>
      <Field id="confirmPassword" label={t("auth.confirmPassword")} error={msg(t, errors.confirmPassword?.message)}>
        <Input id="confirmPassword" type="password" autoComplete="new-password" aria-invalid={!!errors.confirmPassword} {...register("confirmPassword")} />
      </Field>
      <div>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1 size-4 accent-[#1f4d3a]" {...register("acceptTerms")} />
          <span>{t("auth.terms")} (<Link href="/terms" className="underline">{t("pub.terms.title")}</Link>, <Link href="/privacy" className="underline">{t("pub.privacy.title")}</Link>)</span>
        </label>
        {errors.acceptTerms ? <p role="alert" className="mt-1 text-sm font-medium text-danger">{t("err.validation")}</p> : null}
      </div>
      <TurnstileWidget onToken={cap.onToken} resetKey={cap.resetKey} />
      {captchaMissing ? <Alert variant="error">{t("auth.captcha")}</Alert> : null}
      <Button type="submit" className="w-full" disabled={act.pending}>{act.pending ? t("common.loading") : t("auth.submit.register")}</Button>
    </form>
  );
}

export function ForgotForm() {
  const { t } = useT();
  const act = useAction();
  const cap = useCaptcha();
  const [captchaMissing, setCaptchaMissing] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<z.input<typeof resetRequestSchema>>({ resolver: zodResolver(resetRequestSchema) });
  if (act.result?.ok) return <Alert variant="success">{act.result.message}</Alert>;
  return (
    <form noValidate className="space-y-4" onSubmit={handleSubmit((v) => {
      if (cap.needed && !cap.token) { setCaptchaMissing(true); return; }
      act.run(() => requestPasswordResetAction(v, cap.token));
    })}>
      <ResultAlert result={act.result} />
      <Field id="email" label={t("auth.email")} error={errors.email && t("err.validation")}>
        <Input id="email" type="email" autoComplete="email" inputMode="email" aria-invalid={!!errors.email} {...register("email")} />
      </Field>
      <TurnstileWidget onToken={cap.onToken} resetKey={cap.resetKey} />
      {captchaMissing ? <Alert variant="error">{t("auth.captcha")}</Alert> : null}
      <Button type="submit" className="w-full" disabled={act.pending}>{act.pending ? t("common.loading") : t("auth.reset.send")}</Button>
    </form>
  );
}

export function NewPasswordForm({ done }: { done?: boolean }) {
  const { t } = useT();
  const act = useAction();
  const { register, handleSubmit, formState: { errors } } = useForm<z.input<typeof newPasswordSchema>>({ resolver: zodResolver(newPasswordSchema) });
  if (act.result?.ok || done) {
    return (<div className="space-y-4"><Alert variant="success">{t("auth.reset.done")}</Alert><Button asChild><Link href="/dashboard">{t("nav.dashboard")}</Link></Button></div>);
  }
  return (
    <form noValidate className="space-y-4" onSubmit={handleSubmit((v) => act.run(() => updatePasswordAction(v)))}>
      <ResultAlert result={act.result} />
      <Field id="password" label={t("st.newPassword")} hint={t("auth.passwordHint")} error={msg(t, errors.password?.message)}>
        <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...register("password")} />
      </Field>
      <Field id="confirmPassword" label={t("auth.confirmPassword")} error={msg(t, errors.confirmPassword?.message)}>
        <Input id="confirmPassword" type="password" autoComplete="new-password" aria-invalid={!!errors.confirmPassword} {...register("confirmPassword")} />
      </Field>
      <Button type="submit" className="w-full" disabled={act.pending}>{act.pending ? t("common.loading") : t("auth.reset.new.submit")}</Button>
    </form>
  );
}
