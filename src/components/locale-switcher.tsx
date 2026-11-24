"use client";
import { useTransition } from "react";
import { Globe } from "lucide-react";
import { setLocaleAction } from "@/actions/locale";
import { useT } from "@/lib/i18n/client";

export function LocaleSwitcher({ className }: { className?: string }) {
  const { locale, t } = useT();
  const [pending, start] = useTransition();
  const next = locale === "en" ? "ur" : "en";
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => { await setLocaleAction(next); })}
      className={className ?? "inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-semibold text-forest-800 hover:bg-forest-100"}
      lang={next}
    >
      <Globe className="size-4" aria-hidden />
      {t("nav.language")}
    </button>
  );
}
