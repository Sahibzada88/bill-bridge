import * as React from "react";
import { cn } from "@/lib/utils";

const base = "w-full rounded-md border border-line bg-paper px-3 py-2 text-base text-ink placeholder:text-muted/70 min-h-11 focus-visible:border-forest-500 disabled:bg-mist disabled:opacity-70 aria-[invalid=true]:border-danger";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(base, className)} {...p} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(base, "min-h-28 leading-relaxed", className)} {...p} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => (
  <select ref={ref} className={cn(base, "pe-8", className)} {...p}>{children}</select>
));
Select.displayName = "Select";

export function Label({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("block text-sm font-semibold text-ink mb-1.5", className)} {...p} />;
}

export function Field({ id, label, error, hint, optional, children, className }: {
  id: string; label: string; error?: string; hint?: string; optional?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={id}>
        {label}
        {optional ? <span className="ms-2 font-normal text-muted">({optional})</span> : null}
      </Label>
      {children}
      {hint && !error ? <p id={`${id}-hint`} className="text-sm text-muted">{hint}</p> : null}
      {error ? <p id={`${id}-err`} role="alert" className="text-sm font-medium text-danger">{error}</p> : null}
    </div>
  );
}
