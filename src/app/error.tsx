"use client";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useT();
  return (<div className="mx-auto max-w-xl px-4 py-24 text-center" role="alert"><h1 className="font-display text-2xl font-semibold text-forest-900">{t("common.error")}</h1><Button className="mt-6" onClick={reset}>{t("common.refresh")}</Button></div>);
}
