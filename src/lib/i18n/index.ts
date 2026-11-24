import { en, type MessageKey } from "./en";
import { ur } from "./ur";

export type Locale = "en" | "ur";
export const LOCALES: Locale[] = ["en", "ur"];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "bb_locale";
export const dictionaries: Record<Locale, Record<MessageKey, string>> = { en, ur };
export type { MessageKey };

export function isLocale(v: unknown): v is Locale {
  return v === "en" || v === "ur";
}
export function dirFor(locale: Locale): "ltr" | "rtl" {
  return locale === "ur" ? "rtl" : "ltr";
}

export type TFunction = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function makeT(locale: Locale): TFunction {
  const dict = dictionaries[locale];
  return (key, vars) => {
    let s: string = dict[key] ?? en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}

/** Maps a workflow error code (raised by the DB) to a translated message. */
export function errorMessage(t: TFunction, code: string | null | undefined): string {
  const key = `err.${code ?? "unknown"}` as MessageKey;
  return key in en ? t(key) : t("err.unknown");
}
