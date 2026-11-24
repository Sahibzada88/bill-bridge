import * as React from "react";
import { cn } from "@/lib/utils";

export function EmptyState({ title, help, action, className }: { title: string; help?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-dashed border-forest-200 bg-forest-50/50 px-6 py-10 text-center", className)}>
      <p className="font-display text-lg font-semibold text-forest-900">{title}</p>
      {help ? <p className="mx-auto mt-1 max-w-md text-sm text-muted">{help}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-mist", className)} />;
}
