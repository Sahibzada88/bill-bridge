import Link from "next/link";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";
import { browseSchema, UTILITY_TYPES } from "@/lib/validation";
import { sanitizeSearchTerm } from "@/lib/utils";
import { RequestCard } from "@/components/request-card";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { Input, Select } from "@/components/ui/input";
import type { PublicRequestCard } from "@/types";

export const metadata = { title: "Browse requests" };
const PAGE_SIZE = 12;

export default async function BrowsePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const flat = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]).filter(([, v]) => v !== "" && v !== undefined));
  const parsed = browseSchema.safeParse(flat);
  const f = parsed.success ? parsed.data : browseSchema.parse({});
  const { t, locale } = await getT();
  const supabase = await createClient();

  // Keep availability accurate: sweep expired reservations before listing.
  await supabase.rpc("release_expired_reservations");

  let q = supabase.from("public_request_cards").select("*", { count: "exact" });
  q = f.open === "1" ? q.eq("lifecycle", "open") : q.in("lifecycle", ["open", "reserved", "payment_pending", "completed"]);
  if (f.type) q = q.eq("utility_type", f.type);
  const city = f.city ? sanitizeSearchTerm(f.city) : "";
  if (city) q = q.ilike("city", `%${city}%`);
  if (f.min !== undefined) q = q.gte("amount_due", f.min);
  if (f.max !== undefined) q = q.lte("amount_due", f.max);
  const term = f.q ? sanitizeSearchTerm(f.q) : "";
  if (term) q = q.textSearch("search", term, { type: "plain", config: "simple" });
  q = f.sort === "due" ? q.order("due_date", { ascending: true }) : f.sort === "remaining" ? q.order("amount_due", { ascending: true }) : q.order("published_at", { ascending: false });
  const from = (f.page - 1) * PAGE_SIZE;
  const { data, count } = await q.range(from, from + PAGE_SIZE - 1);
  const rows = (data ?? []) as PublicRequestCard[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const qs = (over: Record<string, string | number>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...flat, ...over })) if (v !== undefined && v !== "") p.set(k, String(v));
    return `/requests?${p.toString()}`;
  };

  return (
    <PageShell title={t("dn.browse")}>
      <form method="get" role="search" className="grid gap-3 rounded-lg border border-line bg-paper p-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="relative sm:col-span-2 lg:col-span-2">
          <label htmlFor="q" className="sr-only">{t("dn.search")}</label>
          <Search className="pointer-events-none absolute start-3 top-3.5 size-4 text-muted" aria-hidden />
          <Input id="q" name="q" defaultValue={f.q ?? ""} placeholder={t("dn.search")} className="ps-9" maxLength={80} />
        </div>
        <div>
          <label htmlFor="type" className="sr-only">{t("rf.utility")}</label>
          <Select id="type" name="type" defaultValue={f.type ?? ""}>
            <option value="">{t("dn.allTypes")}</option>
            {UTILITY_TYPES.map((u) => <option key={u} value={u}>{t(`ut.${u}`)}</option>)}
          </Select>
        </div>
        <div>
          <label htmlFor="city" className="sr-only">{t("common.city")}</label>
          <Input id="city" name="city" defaultValue={f.city ?? ""} placeholder={t("dn.allCities")} maxLength={80} />
        </div>
        <div>
          <label htmlFor="sort" className="sr-only">{t("dn.sort")}</label>
          <Select id="sort" name="sort" defaultValue={f.sort}>
            <option value="newest">{t("dn.sort.newest")}</option>
            <option value="due">{t("dn.sort.due")}</option>
            <option value="remaining">{t("dn.sort.remaining")}</option>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label htmlFor="min" className="sr-only">{t("dn.minAmount")}</label><Input id="min" name="min" type="number" min={0} inputMode="numeric" defaultValue={f.min ?? ""} placeholder={t("dn.minAmount")} /></div>
          <div><label htmlFor="max" className="sr-only">{t("dn.maxAmount")}</label><Input id="max" name="max" type="number" min={0} inputMode="numeric" defaultValue={f.max ?? ""} placeholder={t("dn.maxAmount")} /></div>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium sm:col-span-2 lg:col-span-3">
          <input type="hidden" name="open" value="0" />
          <input type="checkbox" name="open" value="1" defaultChecked={f.open === "1"} className="size-4 accent-[#1f4d3a]" />
          {t("dn.onlyOpen")}
        </label>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-3 lg:justify-end">
          <Button type="submit">{t("common.filter")}</Button>
          <Button asChild variant="secondary"><Link href="/requests">{t("common.clear")}</Link></Button>
        </div>
      </form>

      <p className="mt-5 text-sm text-muted" aria-live="polite">{t("dn.results", { n: total })}</p>
      {rows.length ? (
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => <RequestCard key={r.id} r={r} t={t} locale={locale} />)}
        </div>
      ) : <EmptyState className="mt-4" title={t("dn.empty")} help={t("dn.emptyHelp")} action={<Button asChild variant="secondary"><Link href="/requests">{t("common.clear")}</Link></Button>} />}

      {pages > 1 ? (
        <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-3">
          {f.page > 1 ? <Button asChild variant="secondary"><Link href={qs({ page: f.page - 1 })}>{t("common.previous")}</Link></Button> : null}
          <span className="text-sm text-muted">{t("common.page")} {f.page} / {pages}</span>
          {f.page < pages ? <Button asChild variant="secondary"><Link href={qs({ page: f.page + 1 })}>{t("common.next")}</Link></Button> : null}
        </nav>
      ) : null}
    </PageShell>
  );
}
