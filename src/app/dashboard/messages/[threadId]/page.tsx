import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";
import { formatDateTime } from "@/lib/utils";
import { MessageComposer } from "@/components/forms/message-composer";
import { markThreadReadAction } from "@/actions/messages";

export const metadata = { title: "Conversation" };

export default async function ThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  if (!z.string().uuid().safeParse(threadId).success) notFound();
  const s = await requireSession(`/dashboard/messages/${threadId}`);
  const { t, locale } = await getT();
  const supabase = await createClient();
  const { data: thread } = await supabase.from("threads").select("*").eq("id", threadId).maybeSingle(); // RLS: participants only
  if (!thread) notFound();
  const otherId = thread.donor_id === s.userId ? thread.requester_id : thread.donor_id;
  const [{ data: msgs }, { data: other }, { data: req }] = await Promise.all([
    supabase.from("messages").select("id, sender_id, body, created_at").eq("thread_id", threadId).order("created_at"),
    supabase.from("profile_names").select("display_name").eq("id", otherId).maybeSingle(),
    supabase.from("public_request_cards").select("id, title").eq("id", thread.request_id).maybeSingle(),
  ]);
  await markThreadReadAction(threadId);
  return (
    <div className="space-y-5">
      <div>
        <Link href="/dashboard/messages" className="text-sm font-semibold text-forest-700 underline underline-offset-4">← {t("msg.title")}</Link>
        <h1 className="mt-2 font-display text-2xl font-semibold text-forest-900">{t("msg.with")} {other?.display_name ?? "—"}</h1>
        {req ? <p className="text-sm text-muted">{t("msg.about")}: <Link href={`/requests/${req.id}`} className="underline">{req.title}</Link></p> : null}
      </div>
      <ul className="space-y-3" aria-live="polite">
        {(msgs ?? []).map((m) => {
          const mine = m.sender_id === s.userId;
          return (
            <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-lg px-4 py-2.5 ${mine ? "bg-forest-700 text-white" : "border border-line bg-paper"}`}>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={`mt-1 text-xs ${mine ? "text-forest-200" : "text-muted"}`}>{formatDateTime(m.created_at, locale)}</p>
              </div>
            </li>
          );
        })}
        {!msgs?.length ? <li className="text-muted">{t("msg.empty")}</li> : null}
      </ul>
      <MessageComposer threadId={threadId} />
    </div>
  );
}
