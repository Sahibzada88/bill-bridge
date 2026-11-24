import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { Logo } from "./logo";

export async function SiteFooter() {
  const { t } = await getT();
  const col = "flex flex-col gap-2 text-sm";
  const a = "text-forest-800 hover:underline min-h-6";
  return (
    <footer className="mt-20 border-t border-line bg-forest-900 text-forest-100">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5 font-display text-xl font-semibold text-white"><Logo /> {t("app.name")}</div>
          <p className="mt-3 max-w-sm text-sm text-forest-200">{t("app.tagline")}</p>
        </div>
        <nav aria-label={t("footer.explore")} className={col}>
          <p className="font-display text-base font-semibold text-white">{t("footer.explore")}</p>
          {([["/requests", "nav.browse"], ["/how-it-works", "nav.how"], ["/faq", "nav.faq"], ["/safety", "nav.safety"], ["/transparency", "nav.transparency"]] as const).map(([h, k]) => (
            <Link key={h} href={h} className={a.replace("text-forest-800", "text-forest-100")}>{t(k)}</Link>
          ))}
        </nav>
        <nav aria-label={t("footer.legal")} className={col}>
          <p className="font-display text-base font-semibold text-white">{t("footer.legal")}</p>
          {([["/about", "nav.about"], ["/contact", "nav.contact"], ["/privacy", "pub.privacy.title"], ["/terms", "pub.terms.title"]] as const).map(([h, k]) => (
            <Link key={h} href={h} className={a.replace("text-forest-800", "text-forest-100")}>{t(k)}</Link>
          ))}
        </nav>
      </div>
      <div className="border-t border-forest-800 px-4 py-5 text-center text-xs text-forest-200">{t("footer.rights")}</div>
    </footer>
  );
}
