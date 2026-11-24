import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPKR(amount: number | string, locale: string = "en"): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat(locale === "ur" ? "ur-PK" : "en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);
}

export function formatDate(d: string | Date, locale: string = "en"): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "ur" ? "ur-PK" : "en-GB", { dateStyle: "medium" }).format(date);
}

export function formatDateTime(d: string | Date, locale: string = "en"): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "ur" ? "ur-PK" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function progressPct(paid: number | string, due: number | string): number {
  const p = Number(paid);
  const d = Number(due);
  if (!d || d <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((p / d) * 100)));
}

/** Only allow same-site relative redirects (prevents open-redirect). */
export function safeRedirectPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\r\n]/.test(next)) return fallback;
  return next;
}

/** Escape a user string for use inside a PostgREST `ilike`/`or` filter. */
export function sanitizeSearchTerm(q: string): string {
  return q.replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

/** Current time in ms. Server components deliberately read the clock per request. */
export function nowMs(): number {
  return Date.now();
}
