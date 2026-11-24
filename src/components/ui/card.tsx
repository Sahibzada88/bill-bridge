import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-line bg-paper", className)} {...p} />;
}
export function CardHeader({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pt-5 pb-2", className)} {...p} />;
}
export function CardTitle({ className, ...p }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("font-display text-xl font-semibold text-forest-900", className)} {...p} />;
}
export function CardBody({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5", className)} {...p} />;
}
