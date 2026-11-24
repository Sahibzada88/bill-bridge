"use client";
import { useEffect, useRef } from "react";
import { publicEnv } from "@/lib/env";

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id?: string): void;
  remove(id?: string): void;
}
declare global { interface Window { turnstile?: TurnstileApi } }

/** Cloudflare Turnstile widget. Renders nothing when no site key is configured (development). */
export function TurnstileWidget({ onToken, resetKey }: { onToken: (t: string | null) => void; resetKey?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const idRef = useRef<string | undefined>(undefined);
  const siteKey = publicEnv.turnstileSiteKey;

  useEffect(() => {
    if (!siteKey || !ref.current) return;
    let cancelled = false;
    const mount = () => {
      if (cancelled || !ref.current || !window.turnstile) return false;
      idRef.current = window.turnstile.render(ref.current, {
        sitekey: siteKey,
        callback: (tok: string) => onToken(tok),
        "expired-callback": () => onToken(null),
        "error-callback": () => onToken(null),
      });
      return true;
    };
    if (!mount()) {
      const iv = setInterval(() => { if (mount()) clearInterval(iv); }, 250);
      return () => { cancelled = true; clearInterval(iv); };
    }
    return () => { cancelled = true; if (idRef.current) window.turnstile?.remove(idRef.current); };
  }, [siteKey, onToken]);

  useEffect(() => {
    if (resetKey && idRef.current) { window.turnstile?.reset(idRef.current); onToken(null); }
  }, [resetKey, onToken]);

  if (!siteKey) return null;
  return <div ref={ref} className="min-h-[65px]" />;
}
