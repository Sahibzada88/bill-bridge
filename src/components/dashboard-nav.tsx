"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface DashItem { href: string; label: string }

export function DashboardNav({ items, label }: { items: DashItem[]; label: string }) {
  const path = usePathname();
  const active = (href: string) => path === href || (href !== "/dashboard/requester" && href !== "/dashboard/donor" && href !== "/dashboard/admin" && path.startsWith(href));
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
      <ul className="flex gap-1 whitespace-nowrap lg:flex-col">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} aria-current={active(i.href) ? "page" : undefined}
              className={cn("inline-flex min-h-11 w-full items-center rounded-md px-3 text-sm font-semibold", active(i.href) ? "bg-forest-700 text-white" : "text-forest-800 hover:bg-forest-100")}>
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
