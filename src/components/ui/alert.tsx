import * as React from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const styles = {
  info: { box: "bg-info-soft text-info border-[#b6d0dc]", Icon: Info },
  success: { box: "bg-forest-100 text-forest-900 border-forest-200", Icon: CheckCircle2 },
  warning: { box: "bg-warn-soft text-warn border-[#ecd38f]", Icon: TriangleAlert },
  error: { box: "bg-danger-soft text-danger border-[#efb9ae]", Icon: AlertCircle },
} as const;

export function Alert({ variant = "info", className, children, ...p }: React.HTMLAttributes<HTMLDivElement> & { variant?: keyof typeof styles }) {
  const { box, Icon } = styles[variant];
  return (
    <div role={variant === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-md border px-4 py-3 text-sm", box, className)} {...p}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
