import * as React from "react";
import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-mist text-ink border-line",
  green: "bg-forest-100 text-forest-900 border-forest-200",
  amber: "bg-warn-soft text-warn border-[#ecd38f]",
  red: "bg-danger-soft text-danger border-[#efb9ae]",
  blue: "bg-info-soft text-info border-[#b6d0dc]",
} as const;
export type Tone = keyof typeof tones;

export function Badge({ tone = "neutral", className, ...p }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)} {...p} />;
}
