import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, makeT, type Locale, type TFunction } from "./index";

export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

export async function getT(): Promise<{ t: TFunction; locale: Locale }> {
  const locale = await getLocale();
  return { t: makeT(locale), locale };
}
