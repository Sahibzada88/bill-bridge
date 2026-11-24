"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { sendMessageAction } from "@/actions/messages";
import { useT } from "@/lib/i18n/client";
import { ResultAlert, useAction } from "./use-action";

export function MessageComposer({ threadId }: { threadId: string }) {
  const { t } = useT();
  const a = useAction();
  const [body, setBody] = useState("");
  return (
    <div className="space-y-3">
      <Alert variant="warning">{t("msg.safety")}</Alert>
      <label htmlFor="msg" className="sr-only">{t("msg.placeholder")}</label>
      <Textarea id="msg" rows={3} value={body} maxLength={2000} placeholder={t("msg.placeholder")} onChange={(e) => setBody(e.target.value)} />
      <ResultAlert result={a.result && !a.result.ok ? a.result : null} />
      <Button disabled={a.pending || !body.trim()} onClick={() => a.run(() => sendMessageAction({ threadId, body }), () => setBody(""))}>{t("common.send")}</Button>
    </div>
  );
}
