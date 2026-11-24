import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";
import { formatDateTime, safeRedirectPath } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty";
import { MarkAllRead, MarkRead } from "@/components/forms/notification-actions";
import type { MessageKey } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";
import type { NotificationRow } from "@/types";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const s = await requireSession("/dashboard/notifications");
  const { t, locale } = await getT();
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("*").eq("user_id", s.userId).order("created_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as NotificationRow[];
  const unread = rows.filter((n) => !n.read_at).length;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold text-forest-900">{t("nt.title")} {unread ? <span className="text-lg text-muted">({unread})</span> : null}</h1>
        {unread ? <MarkAllRead /> : null}
      </div>
      {rows.length ? (
        <ul className="divide-y divide-line rounded-lg border border-line bg-paper">
          {rows.map((n) => {
            const key = `nt.${n.type}` as MessageKey;
            const text = key in en ? t(key) : t("nt.title");
            const href = n.link ? safeRedirectPath(n.link, "/dashboard") : null;
            return (
              <li key={n.id} className={`flex items-start justify-between gap-3 p-4 ${n.read_at ? "" : "bg-forest-50"}`}>
                <div className="min-w-0">
                  {href ? <Link href={href} className="font-semibold text-forest-900 hover:underline">{text}</Link> : <p className="font-semibold">{text}</p>}
                  <p className="text-sm text-muted">{formatDateTime(n.created_at, locale)}</p>
                </div>
                {!n.read_at ? <MarkRead id={n.id} /> : null}
              </li>
            );
          })}
        </ul>
      ) : <EmptyState title={t("nt.empty")} />}
    </div>
  );
}
