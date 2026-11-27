import { requireSession } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { DashboardNav, type DashItem } from "@/components/dashboard-nav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession("/dashboard");
  const { t } = await getT();
  const role = s.profile.role;
  const items: DashItem[] =
    role === "requester" ? [
      { href: "/dashboard/requester", label: t("rf.myRequests") },
      { href: "/dashboard/requester/requests/new", label: t("rf.new") },
    ] : role === "donor" ? [
      { href: "/dashboard/donor", label: t("nav.dashboard") },
      { href: "/dashboard/donor/reservations", label: t("dn.reservations") },
      { href: "/dashboard/donor/contributions", label: t("dn.contributions") },
      { href: "/dashboard/donor/saved", label: t("dn.savedList") },
    ] : [
      { href: "/dashboard/admin", label: t("ad.overview") },
      { href: "/dashboard/admin/users", label: t("ad.users") },
      { href: "/dashboard/admin/requests", label: t("ad.requests") },
      { href: "/dashboard/admin/reports", label: t("ad.reports") },
      { href: "/dashboard/admin/payments", label: t("ad.payments") },
      { href: "/dashboard/admin/audit", label: t("ad.audit") },
      { href: "/dashboard/admin/locations", label: t("ad.locations") },
      { href: "/dashboard/admin/security", label: t("ad.security") },
      { href: "/dashboard/admin/mfa", label: t("ad.mfa") },
    ];
  items.push(
    { href: "/dashboard/messages", label: t("nav.messages") },
    { href: "/dashboard/notifications", label: t("nav.notifications") },
    { href: "/dashboard/settings", label: t("nav.settings") },
  );
  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[220px_1fr] lg:py-10">
      <div className="lg:sticky lg:top-20 lg:self-start">
        <p className="mb-2 hidden px-3 text-xs font-bold uppercase tracking-wide text-muted lg:block">{s.profile.full_name}</p>
        <DashboardNav items={items} label={t("nav.dashboard")} />
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
