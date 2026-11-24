import Link from "next/link";
import { MapPin, CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Meter } from "@/components/ui/progress";
import { VerificationBadge, LifecycleBadge } from "@/components/status";
import { formatDate, formatPKR, progressPct } from "@/lib/utils";
import type { TFunction, Locale } from "@/lib/i18n";
import type { PublicRequestCard } from "@/types";

export function RequestCard({ r, t, locale }: { r: PublicRequestCard; t: TFunction; locale: Locale }) {
  const pct = progressPct(r.amount_paid, r.amount_due);
  const remaining = Math.max(0, Number(r.amount_due) - Number(r.amount_paid));
  return (
    <article className="group relative flex flex-col rounded-lg border border-line bg-paper p-5 transition-colors hover:border-forest-500">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="green">{t(`ut.${r.utility_type}`)}</Badge>
        <LifecycleBadge status={r.lifecycle} t={t} />
      </div>
      <h3 className="mt-3 font-display text-lg font-semibold leading-snug text-forest-900">
        <Link href={`/requests/${r.id}`} className="after:absolute after:inset-0 after:content-['']">{r.title}</Link>
      </h3>
      <p className="mt-1 line-clamp-2 text-sm text-muted">{r.description}</p>
      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
        <div className="flex items-center gap-1.5"><MapPin className="size-4" aria-hidden /><dt className="sr-only">{t("common.city")}</dt><dd>{r.city} · {r.provider_name}</dd></div>
        <div className="flex items-center gap-1.5"><CalendarClock className="size-4" aria-hidden /><dt className="sr-only">{t("common.due")}</dt><dd>{formatDate(r.due_date, locale)}</dd></div>
      </dl>
      <div className="mt-4">
        <div className="mb-1.5 flex items-baseline justify-between text-sm">
          <span className="font-semibold text-forest-900">{formatPKR(remaining, locale)} <span className="font-normal text-muted">{t("common.remaining")}</span></span>
          <span className="text-muted">{formatPKR(r.amount_due, locale)}</span>
        </div>
        <Meter percent={pct} label={t("pub.detail.progress", { p: pct })} />
      </div>
      <div className="mt-4"><VerificationBadge status={r.verification_status} t={t} /></div>
    </article>
  );
}
