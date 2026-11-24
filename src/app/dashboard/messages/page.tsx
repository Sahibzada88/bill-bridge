import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";
import { formatDateTime } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty";

export const metadata = { title: "Messages" };

export default async function MessagesPage() {
  const s = await requireSession("/dashboard/messages");
  const { t, locale } = await getT();
  const supabase = await createClient();
  const { data: threads } = await supabase.from("threads").select("id, request_id, donor_id, requester_id, created_at").order("created_at", { ascending: false });
  const ids = (threads ?? []).map((x) => x.id);
  const reqIds = [...new Set((threads ?? []).map((x) => x.request_id))];
  const otherIds = [...new Set((threads ?? []).map((x) => (x.donor_id === s.userId ? x.requester_id : x.donor_id)))];
  const [{ data: msgs }, { data: reqs }, { data: names }] = await Promise.all([
    ids.length ? supabase.from("messages").select("thread_id, body, sender_id, read_at, created_at").in("thread_id", ids).order("created_at", { ascending: false }) : Promise.resolve({ data: [] as { thread_id: string; body: string; sender_id: string; read_at: string | null; created_at: string }[] }),
    reqIds.length ? supabase.from("public_request_cards").select("id, title").in("id", reqIds) : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    otherIds.length ? supabase.from("profile_names").select("id, display_name").in("id", otherIds) : Promise.resolve({ data: [] as { id: string; display_name: string }[] }),
  ]);
  const title = new Map((reqs ?? []).map((r) => [r.id, r.title]));
  const name = new Map((names ?? []).map((n) => [n.id, n.display_name]));
  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-semibold text-forest-900">{t("msg.title")}</h1>
      {threads?.length ? (
        <ul className="divide-y divide-line rounded-lg border border-line bg-paper">
          {threads.map((th) => {
            const last = (msgs ?? []).find((m) => m.thread_id === th.id);
            const unread = (msgs ?? []).some((m) => m.thread_id === th.id && m.sender_id !== s.userId && !m.read_at);
            const other = th.donor_id === s.userId ? th.requester_id : th.donor_id;
            return (
              <li key={th.id}>
                <Link href={`/dashboard/messages/${th.id}`} className="block p-4 hover:bg-forest-50">
                  <div className="flex items-center justify-between gap-3">
                    <p className={`truncate ${unread ? "font-bold" : "font-semibold"} text-forest-900`}>{name.get(other) ?? "—"} · <span className="font-normal text-muted">{title.get(th.request_id) ?? ""}</span></p>
                    {unread ? <span className="size-2.5 shrink-0 rounded-full bg-danger" aria-label="unread" /> : null}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted">{last?.body ?? "—"}</p>
                  <p className="mt-0.5 text-xs text-muted">{formatDateTime(last?.created_at ?? th.created_at, locale)}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : <EmptyState title={t("msg.empty")} />}
    </div>
  );
}
