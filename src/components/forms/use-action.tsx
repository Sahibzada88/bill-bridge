"use client";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import type { ActionResult } from "@/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyResult = ActionResult<any>;

export function useAction() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<AnyResult | null>(null);
  function run(fn: () => Promise<AnyResult | void>, onOk?: (r: AnyResult) => void) {
    setResult(null);
    start(async () => {
      const r = await fn();
      if (!r) return; // action redirected
      setResult(r);
      if (r.ok) onOk?.(r);
    });
  }
  return { pending, result, run, reset: () => setResult(null) };
}

export function ResultAlert({ result }: { result: AnyResult | null }) {
  if (!result) return null;
  if (result.ok) return result.message ? <Alert variant="success">{result.message}</Alert> : null;
  return <Alert variant="error">{result.error}</Alert>;
}
