"use client";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/actions/notifications";

export function MarkAllRead() {
  const { t } = useT();
  const [p, start] = useTransition();
  return <Button variant="secondary" size="sm" disabled={p} onClick={() => start(async () => { await markAllNotificationsReadAction(); })}>{t("common.markAllRead")}</Button>;
}
export function MarkRead({ id }: { id: string }) {
  const { t } = useT();
  const [p, start] = useTransition();
  return <Button variant="ghost" size="sm" disabled={p} onClick={() => start(async () => { await markNotificationReadAction(id); })}>{t("common.confirm")}</Button>;
}
