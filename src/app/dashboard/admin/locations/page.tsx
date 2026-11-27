import Link from "next/link";
import { MapPin } from "lucide-react";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";
import { formatDateTime } from "@/lib/utils";
import { mapUrl } from "@/lib/location";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Login locations" };

interface Latest {
  user_id: string; full_name: string; role: string; is_suspended: boolean;
  gps_lat: number | null; gps_lon: number | null; gps_accuracy: number | null; gps_at: string | null;
  ip_lat: number | null; ip_lon: number | null; ip_country: string | null; ip_city: string | null; ip_at: string | null;
  last_source: string; last_login_at: string;
}
interface Hist { id: number; source: string; latitude: number | null; longitude: number | null; accuracy_m: number | null; ip_country: string | null; ip_region: string | null; ip_city: string | null; user_agent: string | null; created_at: string }

export default async function AdminLocations({ searchParams }: { searchParams: Promise<{ user?: string }> }) {
  await requireAdmin();
  const { t, locale } = await getT();
  const { user } = await searchParams;
  const supabase = await createClient();
  // Reads go ONLY through audited SQL functions that re-check is_admin() (role + MFA) inside the database.
  const target = user && z.string().uuid().safeParse(user).success ? user : null;

  const Map = ({ lat, lon, label }: { lat: number; lon: number; label: string }) => (
    <a href={mapUrl(lat, lon)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-forest-700 underline underline-offset-4"><MapPin className="size-3.5" aria-hidden />{label}</a>
  );

  if (target) {
    const { data, error } = await supabase.rpc("admin_user_locations", { p_user: target });
    const rows = (data ?? []) as Hist[];
    return (
      <div className="space-y-5">
        <Link href="/dashboard/admin/locations" className="text-sm font-semibold text-forest-700 underline underline-offset-4">← {t("ad.loc.back")}</Link>
        <h1 className="font-display text-3xl font-semibold text-forest-900">{t("ad.loc.history")}</h1>
        {error ? <Alert variant="error">{t("common.unauthorized")}</Alert> : null}
        {!rows.length && !error ? <p className="text-muted">{t("ad.loc.never")}</p> : null}
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-lg border border-line bg-paper p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge tone={r.source === "gps" ? "green" : r.source === "ip" ? "blue" : "red"}>{r.source === "gps" ? t("ad.loc.gps") : r.source === "ip" ? t("ad.loc.ip") : r.source === "denied" ? t("ad.loc.denied") : t("ad.loc.unavailable")}</Badge>
                <span className="text-muted">{formatDateTime(r.created_at, locale)}</span>
              </div>
              {r.latitude !== null && r.longitude !== null ? (
                <p className="mt-2"><span className="font-mono" dir="ltr">{r.latitude.toFixed(5)}, {r.longitude.toFixed(5)}</span>{r.accuracy_m !== null ? <span className="text-muted"> · {t("ad.loc.accuracy", { m: Math.round(r.accuracy_m) })}</span> : null} · <Map lat={r.latitude} lon={r.longitude} label={t("ad.loc.map")} /></p>
              ) : null}
              <p className="mt-1 text-muted">{[r.ip_city, r.ip_region, r.ip_country].filter(Boolean).join(", ")}</p>
              {r.user_agent ? <p className="mt-1 break-all font-mono text-xs text-muted" dir="ltr">{r.user_agent}</p> : null}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const { data, error } = await supabase.rpc("admin_latest_locations");
  const rows = (data ?? []) as Latest[];
  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-semibold text-forest-900">{t("ad.loc.title")}</h1>
      <Alert variant="warning">{t("ad.loc.help")}</Alert>
      {error ? <Alert variant="error">{t("common.unauthorized")}</Alert> : null}
      {!rows.length && !error ? <p className="text-muted">{t("ad.loc.never")}</p> : null}
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.user_id} className="space-y-2 rounded-lg border border-line bg-paper p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-display text-lg font-semibold text-forest-900">{r.full_name} <Badge>{t(`common.${r.role as "admin" | "donor" | "requester"}`)}</Badge> {r.is_suspended ? <Badge tone="red">suspended</Badge> : null}</p>
              <Link href={`/dashboard/admin/locations?user=${r.user_id}`} className="text-sm font-semibold text-forest-700 underline underline-offset-4">{t("ad.loc.history")}</Link>
            </div>
            <p className="text-xs text-muted">{t("ad.loc.lastLogin")}: {formatDateTime(r.last_login_at, locale)}</p>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="font-semibold">{t("ad.loc.gps")}</dt>
                <dd>{r.gps_lat !== null && r.gps_lon !== null
                  ? <><span className="font-mono" dir="ltr">{r.gps_lat.toFixed(5)}, {r.gps_lon.toFixed(5)}</span>{r.gps_accuracy !== null ? <span className="text-muted"> · {t("ad.loc.accuracy", { m: Math.round(r.gps_accuracy) })}</span> : null}<br /><Map lat={r.gps_lat} lon={r.gps_lon} label={t("ad.loc.map")} /> <span className="text-muted">· {r.gps_at ? formatDateTime(r.gps_at, locale) : ""}</span></>
                  : <span className="text-danger">{r.last_source === "denied" ? t("ad.loc.denied") : r.last_source === "unavailable" ? t("ad.loc.unavailable") : t("ad.loc.never")}</span>}</dd></div>
              <div><dt className="font-semibold">{t("ad.loc.ip")}</dt>
                <dd>{r.ip_country || r.ip_city ? <>{[r.ip_city, r.ip_country].filter(Boolean).join(", ")}{r.ip_lat !== null && r.ip_lon !== null ? <> · <Map lat={r.ip_lat} lon={r.ip_lon} label={t("ad.loc.map")} /></> : null}</> : <span className="text-muted">—</span>}</dd></div>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
