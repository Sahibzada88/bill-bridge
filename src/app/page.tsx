import Link from "next/link";
import { ArrowRight, Banknote, Eye, ShieldCheck, UserCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";
import { Button } from "@/components/ui/button";
import { RequestCard } from "@/components/request-card";
import { formatPKR } from "@/lib/utils";
import type { PublicRequestCard } from "@/types";

export default async function HomePage() {
  const { t, locale } = await getT();
  const supabase = await createClient();
  const [{ data: stats }, { data: latest }] = await Promise.all([
    supabase.from("platform_stats").select("*").maybeSingle(),
    supabase.from("public_request_cards").select("*").eq("lifecycle", "open").order("published_at", { ascending: false }).limit(3),
  ]);
  const nf = new Intl.NumberFormat(locale === "ur" ? "ur-PK" : "en-PK");
  const principles = [
    { Icon: Banknote, t: t("home.p1.title"), b: t("home.p1.body") },
    { Icon: Eye, t: t("home.p2.title"), b: t("home.p2.body") },
    { Icon: UserCheck, t: t("home.p3.title"), b: t("home.p3.body") },
    { Icon: ShieldCheck, t: t("home.p4.title"), b: t("home.p4.body") },
  ];
  return (
    <>
      <section className="border-b border-line bg-forest-900 text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:py-20 lg:grid-cols-[1.3fr_1fr] lg:items-center">
          <div>
            <h1 className="font-display text-4xl font-semibold leading-[1.1] sm:text-5xl">{t("home.title")}</h1>
            <p className="mt-5 max-w-xl text-lg text-forest-100">{t("home.subtitle")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-cream text-forest-900 hover:bg-white"><Link href="/requests">{t("home.cta.donate")} <ArrowRight className="size-4 rtl:rotate-180" aria-hidden /></Link></Button>
              <Button asChild size="lg" variant="ghost" className="border border-forest-500 text-white hover:bg-forest-800"><Link href="/register">{t("home.cta.request")}</Link></Button>
            </div>
          </div>
          <dl aria-label={t("home.statsTitle")} className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-forest-700 bg-forest-700">
            {[
              [t("home.stat.active"), nf.format(stats?.active_requests ?? 0)],
              [t("home.stat.completed"), nf.format(stats?.completed_requests ?? 0)],
              [t("home.stat.donors"), nf.format(stats?.donors ?? 0)],
              [t("home.stat.confirmed"), formatPKR(Number(stats?.total_confirmed_amount ?? 0), locale)],
            ].map(([k, v]) => (
              <div key={k} className="bg-forest-800 p-5">
                <dd className="font-display text-2xl font-semibold text-white sm:text-3xl">{v}</dd>
                <dt className="mt-1 text-sm text-forest-200">{k}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="font-display text-2xl font-semibold text-forest-900 sm:text-3xl">{t("home.principles.title")}</h2>
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {principles.map(({ Icon, t: title, b }) => (
            <li key={title} className="border-t-2 border-forest-600 pt-4">
              <Icon className="size-6 text-forest-600" aria-hidden />
              <h3 className="mt-3 font-display text-lg font-semibold text-forest-900">{title}</h3>
              <p className="mt-1 text-sm text-muted">{b}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-6">
        <div className="flex items-end justify-between gap-4">
          <h2 className="font-display text-2xl font-semibold text-forest-900 sm:text-3xl">{t("home.latest")}</h2>
          <Link href="/requests" className="text-sm font-semibold text-forest-700 underline underline-offset-4">{t("home.viewAll")}</Link>
        </div>
        {latest?.length ? (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {(latest as PublicRequestCard[]).map((r) => <RequestCard key={r.id} r={r} t={t} locale={locale} />)}
          </div>
        ) : <p className="mt-6 text-muted">{t("common.none")}</p>}
      </section>
    </>
  );
}
