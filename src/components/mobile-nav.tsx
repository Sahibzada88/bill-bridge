"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { LocaleSwitcher } from "./locale-switcher";

export interface NavItem { href: string; label: string }

export function MobileNav({ items, authed, loginLabel, registerLabel }: { items: NavItem[]; authed: boolean; loginLabel: string; registerLabel: string }) {
  const [open, setOpen] = useState(false);
  const { t } = useT();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open]);

  return (
    <div className="md:hidden">
      <button type="button" aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? t("nav.close") : t("nav.menu")}
        onClick={() => setOpen((o) => !o)} className="inline-flex size-11 items-center justify-center rounded-md text-forest-800 hover:bg-forest-100">
        {open ? <X className="size-6" aria-hidden /> : <Menu className="size-6" aria-hidden />}
      </button>
      {open ? (
        <div id="mobile-menu" className="fixed inset-x-0 top-[var(--header-h,64px)] bottom-0 z-40 overflow-y-auto bg-cream px-4 pb-10 pt-4">
          <nav aria-label="Mobile" className="flex flex-col">
            {items.map((i) => (
              <Link key={i.href} href={i.href} onClick={() => setOpen(false)} className="border-b border-line py-4 text-lg font-semibold text-forest-900">{i.label}</Link>
            ))}
          </nav>
          <div className="mt-6 flex flex-col gap-3">
            {!authed ? (
              <>
                <Link href="/register" onClick={() => setOpen(false)} className="inline-flex min-h-12 items-center justify-center rounded-md bg-forest-700 px-4 font-semibold text-white">{registerLabel}</Link>
                <Link href="/login" onClick={() => setOpen(false)} className="inline-flex min-h-12 items-center justify-center rounded-md border border-forest-200 bg-paper px-4 font-semibold text-forest-800">{loginLabel}</Link>
              </>
            ) : null}
            <LocaleSwitcher className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-line bg-paper px-4 font-semibold text-forest-800" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
