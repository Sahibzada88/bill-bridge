"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useT } from "@/lib/i18n/client";
import { logoutAction } from "@/actions/auth";

type Phase = "idle" | "asking" | "saving" | "denied" | "unavailable" | "insecure" | "error";

/**
 * Asks the browser for the user's location once per login and sends it to /api/location.
 * blocking=true: full-page gate (policy "required"); otherwise a dismissible banner.
 */
export function LocationGate({ blocking }: { blocking: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const started = useRef(false);

  const post = useCallback(async (payload: object): Promise<{ ok: boolean; done?: boolean }> => {
    try {
      const res = await fetch("/api/location", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), credentials: "same-origin" });
      return (await res.json()) as { ok: boolean; done?: boolean };
    } catch { return { ok: false }; }
  }, []);

  // A refusal is recorded once per login session (not on every reload / retry).
  const recordOnce = useCallback(async (status: "denied" | "unavailable") => {
    const key = `bb_loc_${status}`;
    try { if (sessionStorage.getItem(key)) return { ok: true, done: false }; sessionStorage.setItem(key, "1"); } catch { /* storage blocked: record anyway */ }
    return post({ status });
  }, [post]);

  const ask = useCallback(() => {
    if (!window.isSecureContext || !("geolocation" in navigator)) { setPhase(!window.isSecureContext ? "insecure" : "unavailable"); void recordOnce("unavailable"); return; }
    setPhase("asking");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setPhase("saving");
        const r = await post({ status: "granted", latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy });
        if (r.ok && r.done) router.refresh(); else setPhase("error");
      },
      async (err) => {
        const denied = err.code === err.PERMISSION_DENIED;
        setPhase(denied ? "denied" : "unavailable");
        const r = await recordOnce(denied ? "denied" : "unavailable");
        if (r.ok && r.done) router.refresh();
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  }, [post, recordOnce, router]);

  // Ask automatically once. If the browser already remembers a refusal, do not re-prompt on every page load.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const perm = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
        if (perm?.state === "denied") { setPhase("denied"); await recordOnce("denied"); return; }
      } catch { /* Permissions API unavailable: just ask */ }
      ask();
    })();
  }, [ask, recordOnce]);

  const msg =
    phase === "denied" ? t("loc.denied") : phase === "unavailable" ? t("loc.unavailable") :
    phase === "insecure" ? t("loc.insecure") : phase === "error" ? t("common.error") : null;

  const body = (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-forest-100 text-forest-700"><MapPin className="size-5" aria-hidden /></span>
        <div>
          <h2 className="font-display text-xl font-semibold text-forest-900">{t("loc.title")}</h2>
          <p className="mt-1 text-muted">{blocking ? t("loc.body") : t("loc.banner")}</p>
        </div>
      </div>
      <p className="flex items-start gap-2 text-sm text-muted"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-forest-600" aria-hidden />{t("loc.privacy")}</p>
      {msg ? <Alert variant="warning">{msg}</Alert> : null}
      {phase === "asking" || phase === "saving" ? <p role="status" className="text-sm text-muted">{t("loc.asking")}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button onClick={ask} disabled={phase === "asking" || phase === "saving"}>{t("loc.allow")}</Button>
        {!blocking ? <Button variant="secondary" onClick={async () => { await post({ status: "dismissed" }); router.refresh(); }}>{t("loc.later")}</Button> : null}
        {blocking ? <form action={logoutAction}><Button type="submit" variant="ghost">{t("nav.logout")}</Button></form> : null}
      </div>
    </div>
  );

  return blocking
    ? <div className="mx-auto max-w-xl px-4 py-12 sm:py-20"><div className="rounded-lg border border-line bg-paper p-6">{body}</div></div>
    : <div className="border-b border-line bg-forest-50"><div className="mx-auto max-w-6xl px-4 py-4">{body}</div></div>;
}
