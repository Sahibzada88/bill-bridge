import Link from "next/link";
import { Bell } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { logoutAction } from "@/actions/auth";
import { Logo } from "./logo";
import { MobileNav } from "./mobile-nav";
import { LocaleSwitcher } from "./locale-switcher";

export async function SiteHeader() {
  const { t } = await getT();
  const session = await getSession().catch(() => null);
  let unread = 0;
  if (session) {
    const supabase = await createClient();
    const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", session.userId).is("read_at", null);
    unread = count ?? 0;
  }
  const items = [
    { href: "/requests", label: t("nav.browse") },
    { href: "/how-it-works", label: t("nav.how") },
    { href: "/safety", label: t("nav.safety") },
    { href: "/transparency", label: t("nav.transparency") },
    { href: "/about", label: t("nav.about") },
  ];
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-cream/95 backdrop-blur" style={{ ["--header-h" as string]: "65px" }}>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2.5 font-display text-xl font-semibold text-forest-900">
          <Logo /><span>{t("app.name")}</span>
        </Link>
        <nav aria-label="Primary" className="ms-6 hidden items-center gap-1 md:flex">
          {items.map((i) => (
            <Link key={i.href} href={i.href} className="rounded-md px-3 py-2 text-sm font-semibold text-forest-800 hover:bg-forest-100">{i.label}</Link>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-1">
          <div className="hidden md:block"><LocaleSwitcher /></div>
          {session ? (
            <>
              <Link href="/dashboard/notifications" aria-label={`${t("nav.notifications")}${unread ? ` (${unread})` : ""}`}
                className="relative inline-flex size-11 items-center justify-center rounded-md text-forest-800 hover:bg-forest-100">
                <Bell className="size-5" aria-hidden />
                {unread > 0 ? (
                  <span className="absolute end-1.5 top-1.5 min-w-5 rounded-full bg-danger px-1 text-center text-[11px] font-bold leading-5 text-white">{unread > 99 ? "99+" : unread}</span>
                ) : null}
              </Link>
              <Link href="/dashboard" className="hidden min-h-11 items-center rounded-md px-3 text-sm font-semibold text-forest-800 hover:bg-forest-100 sm:inline-flex">{t("nav.dashboard")}</Link>
              <form action={logoutAction} className="hidden sm:block">
                <button className="min-h-11 rounded-md px-3 text-sm font-semibold text-forest-800 hover:bg-forest-100">{t("nav.logout")}</button>
              </form>
            </>
          ) : (
            <div className="hidden items-center gap-2 md:flex">
              <Link href="/login" className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-forest-800 hover:bg-forest-100">{t("nav.login")}</Link>
              <Link href="/register" className="inline-flex min-h-11 items-center rounded-md bg-forest-700 px-4 text-sm font-semibold text-white hover:bg-forest-800">{t("nav.register")}</Link>
            </div>
          )}
          <MobileNav items={session ? [{ href: "/dashboard", label: t("nav.dashboard") }, ...items] : items} authed={!!session} loginLabel={t("nav.login")} registerLabel={t("nav.register")} />
        </div>
      </div>
    </header>
  );
}
