"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Timer } from "lucide-react";
import { useT } from "@/lib/i18n/client";

export function Countdown({ expiresAt }: { expiresAt: string }) {
  const { t } = useT();
  const router = useRouter();
  const target = new Date(expiresAt).getTime();
  const [left, setLeft] = useState(() => Math.max(0, target - Date.now()));
  useEffect(() => {
    const iv = setInterval(() => {
      const l = Math.max(0, target - Date.now());
      setLeft(l);
      if (l === 0) { clearInterval(iv); router.refresh(); }
    }, 1000);
    return () => clearInterval(iv);
  }, [target, router]);
  const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-lg font-semibold tabular-nums text-forest-900" role="timer" aria-label={t("dn.timeLeft")}>
      <Timer className="size-4" aria-hidden />{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}
