import { Check, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { lifecycleTone, paymentTone, verificationTone, VERIFICATION_ORDER } from "@/lib/status";
import type { TFunction } from "@/lib/i18n";
import type { Lifecycle, PaymentStatus, VerificationStatus } from "@/types";
import { cn } from "@/lib/utils";

export function VerificationBadge({ status, t }: { status: VerificationStatus; t: TFunction }) {
  return <Badge tone={verificationTone(status)}>{t(`vs.${status}`)}</Badge>;
}
export function LifecycleBadge({ status, t }: { status: Lifecycle; t: TFunction }) {
  return <Badge tone={lifecycleTone(status)}>{t(`lc.${status}`)}</Badge>;
}
export function PaymentBadge({ status, t }: { status: PaymentStatus; t: TFunction }) {
  return <Badge tone={paymentTone(status)}>{t(`ps.${status}`)}</Badge>;
}

/** Vertical stage list. The disclaimer is always shown: donor reviews are NOT platform verification. */
export function VerificationTimeline({ status, t }: { status: VerificationStatus; t: TFunction }) {
  const disputed = status === "payment_disputed";
  const idx = disputed ? VERIFICATION_ORDER.indexOf("payment_submitted") : VERIFICATION_ORDER.indexOf(status);
  return (
    <div>
      <ol className="space-y-2" aria-label={t("pub.detail.timeline")}>
        {VERIFICATION_ORDER.map((s, i) => {
          const done = i < idx || (i === idx && status === "completed");
          const current = i === idx;
          return (
            <li key={s} aria-current={current ? "step" : undefined} className={cn("flex items-center gap-3 text-sm", current ? "font-semibold text-forest-900" : done ? "text-forest-800" : "text-muted")}>
              <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border", done ? "border-forest-600 bg-forest-600 text-white" : current ? "border-forest-600 bg-forest-100" : "border-line bg-paper")}>
                {done ? <Check className="size-3" aria-hidden /> : <Circle className={cn("size-2", current ? "fill-forest-600 text-forest-600" : "text-transparent")} aria-hidden />}
              </span>
              {t(`vs.${s}`)}
            </li>
          );
        })}
        {disputed ? (
          <li aria-current="step" className="flex items-center gap-3 text-sm font-semibold text-danger">
            <span className="grid size-5 place-items-center rounded-full border border-danger bg-danger-soft"><Circle className="size-2 fill-danger text-danger" aria-hidden /></span>
            {t("vs.payment_disputed")}
          </li>
        ) : null}
      </ol>
      <p className="mt-3 text-xs text-muted">{t("vs.disclaimer")}</p>
    </div>
  );
}
