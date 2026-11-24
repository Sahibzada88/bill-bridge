import { cn } from "@/lib/utils";

/** Ten-tick meter (reads like a utility meter). Accessible as a progressbar. */
export function Meter({ percent, label, className }: { percent: number; label: string; className?: string }) {
  const p = Math.max(0, Math.min(100, percent));
  const ticks = Array.from({ length: 10 }, (_, i) => {
    const start = i * 10;
    if (p >= start + 10) return { on: true, partial: false, fill: 100 };
    if (p > start) return { on: false, partial: true, fill: ((p - start) / 10) * 100 };
    return { on: false, partial: false, fill: 0 };
  });
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-label={label} className={cn("meter", className)}>
      {ticks.map((t, i) => (
        <i key={i} data-on={t.on} data-partial={t.partial} style={t.partial ? ({ "--fill": `${t.fill}%` } as React.CSSProperties) : undefined} />
      ))}
    </div>
  );
}
