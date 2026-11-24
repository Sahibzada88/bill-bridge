"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { makeT, type Locale, type TFunction } from "./index";

interface Ctx { locale: Locale; t: TFunction }
const I18nContext = createContext<Ctx>({ locale: "en", t: makeT("en") });

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo(() => ({ locale, t: makeT(locale) }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
export function useT() {
  return useContext(I18nContext);
}
