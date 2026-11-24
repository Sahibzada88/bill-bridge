import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";
import { formatDateTime } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileForm } from "@/components/forms/profile-form";
import { NewPasswordForm } from "@/components/forms/auth-forms";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const s = await requireSession("/dashboard/settings");
  const { t, locale } = await getT();
  const supabase = await createClient();
  const { data: events } = await supabase.from("security_events").select("id, event_type, created_at").eq("user_id", s.userId).order("created_at", { ascending: false }).limit(10);
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold text-forest-900">{t("st.title")}</h1>
      {s.profile.role === "requester" && (!s.profile.phone || !s.profile.city) ? <Alert variant="warning">{t("rf.profileIncomplete")}</Alert> : null}
      <Card><CardHeader><CardTitle>{t("st.profile")}</CardTitle></CardHeader><CardBody>
        <p className="mb-4 text-sm text-muted">{s.email}</p>
        <ProfileForm initial={{ fullName: s.profile.full_name, phone: s.profile.phone ?? "", city: s.profile.city ?? "", bio: s.profile.bio ?? "", locale: s.profile.preferred_locale, emailNotifications: s.profile.email_notifications }} />
      </CardBody></Card>
      <Card><CardHeader><CardTitle>{t("st.changePassword")}</CardTitle></CardHeader><CardBody><NewPasswordForm /></CardBody></Card>
      <Card><CardHeader><CardTitle>{t("st.recentSecurity")}</CardTitle></CardHeader><CardBody>
        {events?.length ? <ul className="divide-y divide-line text-sm">{events.map((e) => <li key={e.id} className="flex justify-between gap-3 py-2"><span className="font-mono">{e.event_type}</span><span className="text-muted">{formatDateTime(e.created_at, locale)}</span></li>)}</ul> : <p className="text-sm text-muted">{t("common.none")}</p>}
      </CardBody></Card>
    </div>
  );
}
