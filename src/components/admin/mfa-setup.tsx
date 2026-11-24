"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { useT } from "@/lib/i18n/client";
import { recordMfaEventAction } from "@/actions/mfa";

type Mode = "loading" | "enabled" | "challenge" | "idle" | "enroll";

export function MfaSetup() {
  const { t } = useT();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const [{ data: aal }, { data: factors }] = await Promise.all([supabase.auth.mfa.getAuthenticatorAssuranceLevel(), supabase.auth.mfa.listFactors()]);
      const verified = factors?.totp?.find((f) => f.status === "verified");
      if (aal?.currentLevel === "aal2") setMode("enabled");
      else if (verified) { setFactorId(verified.id); setMode("challenge"); }
      else setMode("idle");
    })();
  }, []);

  async function startEnroll() {
    setError(null); setBusy(true);
    const supabase = createClient();
    // Remove any abandoned (unverified) factor first so enrolment can be retried cleanly.
    const { data: factors } = await supabase.auth.mfa.listFactors();
    for (const f of (factors?.all ?? []).filter((x) => x.status === "unverified")) await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error: e } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `BillBridge ${new Date().toISOString().slice(0, 10)}` });
    setBusy(false);
    if (e || !data) { setError(t("common.error")); return; }
    setFactorId(data.id); setQr(data.totp.qr_code); setSecret(data.totp.secret); setMode("enroll");
  }

  async function verify(enrolling: boolean) {
    if (!factorId) return;
    setError(null); setBusy(true);
    const supabase = createClient();
    const { data: ch, error: e1 } = await supabase.auth.mfa.challenge({ factorId });
    if (e1 || !ch) { setBusy(false); setError(t("common.error")); return; }
    const { error: e2 } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code: code.trim() });
    setBusy(false);
    if (e2) { setError(t("auth.err.invalid")); return; }
    await recordMfaEventAction(enrolling ? "mfa_enrolled" : "mfa_verified");
    router.push("/dashboard/admin"); router.refresh();
  }

  if (mode === "loading") return <p className="text-muted">{t("common.loading")}</p>;
  if (mode === "enabled") return <Alert variant="success">{t("ad.mfa.enabled")}</Alert>;
  return (
    <div className="max-w-md space-y-4">
      {mode === "idle" ? (<><Alert variant="warning">{t("ad.mfa.required")}</Alert><Button onClick={startEnroll} disabled={busy}>{t("ad.mfa.start")}</Button></>) : null}
      {mode === "enroll" && qr ? (
        <div className="space-y-3">
          <p>{t("ad.mfa.scan")}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR code" width={192} height={192} className="rounded border border-line bg-white p-2" />
          {secret ? <p className="break-all font-mono text-sm text-muted" dir="ltr">{secret}</p> : null}
        </div>
      ) : null}
      {mode === "challenge" ? <p>{t("ad.mfa.challenge")}</p> : null}
      {(mode === "enroll" || mode === "challenge") ? (
        <div className="space-y-3">
          <Field id="totp" label={t("ad.mfa.code")}><Input id="totp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} dir="ltr" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /></Field>
          <Button onClick={() => verify(mode === "enroll")} disabled={busy || code.length !== 6}>{t("ad.mfa.verify")}</Button>
        </div>
      ) : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
    </div>
  );
}
