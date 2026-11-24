import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { Button } from "@/components/ui/button";
export default async function NotFound() {
  const { t } = await getT();
  return (<div className="mx-auto max-w-xl px-4 py-24 text-center"><p className="font-display text-6xl font-semibold text-forest-600">404</p><h1 className="mt-3 font-display text-2xl font-semibold text-forest-900">{t("common.notFound")}</h1><Button asChild className="mt-6"><Link href="/">{t("nav.home")}</Link></Button></div>);
}
