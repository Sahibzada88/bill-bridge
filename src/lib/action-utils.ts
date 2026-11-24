import "server-only";
import type { ZodError } from "zod";
import type { TFunction } from "@/lib/i18n";
import { errorMessage } from "@/lib/i18n";
import type { ActionResult } from "@/types";

/** Codes that our SQL functions raise on purpose (message == code). Anything else is treated as unknown. */
const KNOWN = /^[a-z_]+$/;

export function fail(t: TFunction, code: string, extra?: Partial<Extract<ActionResult, { ok: false }>>): ActionResult<never> {
  return { ok: false, code, error: errorMessage(t, code), ...extra };
}

export function fromPgError(t: TFunction, error: { message?: string; code?: string } | null | undefined): ActionResult<never> {
  const msg = error?.message ?? "";
  if (KNOWN.test(msg)) return fail(t, msg);
  if (error?.code === "42501") return fail(t, "forbidden");           // RLS / privilege denial
  if (error?.code === "23505") return fail(t, "duplicate_payment");   // unique violations on user-facing writes
  console.error("[db-error]", error?.code, msg.slice(0, 200));       // never leak raw DB text to the client
  return fail(t, "unknown");
}

export function zodFail(t: TFunction, err: ZodError): ActionResult<never> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of err.issues) {
    const k = issue.path.join(".") || "_";
    if (!fieldErrors[k]) fieldErrors[k] = issue.message;
  }
  return { ok: false, code: "validation", error: t("err.validation"), fieldErrors };
}

export function fieldMessage(t: TFunction, code: string | undefined): string | undefined {
  if (!code) return undefined;
  if (code === "weak") return t("auth.err.weak");
  if (code === "mismatch") return t("auth.err.mismatch");
  return t("err.validation");
}
