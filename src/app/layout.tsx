import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getT } from "@/lib/i18n/server";
import { dirFor } from "@/lib/i18n";
import { I18nProvider } from "@/lib/i18n/client";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { publicEnv } from "@/lib/env";
import { getSession } from "@/lib/auth";
import { locationState } from "@/lib/location-server";
import { LocationGate } from "@/components/location-gate";

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.siteUrl),
  title: { default: "BillBridge", template: "%s · BillBridge" },
  description: "Neighbours helping neighbours pay essential utility bills, directly and transparently.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1f4d3a" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, t } = await getT();
  // After a login the user must share their location once (policy: LOCATION_POLICY). Admins are asked but never blocked.
  const session = await getSession().catch(() => null);
  const gate = session ? await locationState(session.profile.role).catch(() => null) : null;
  return (
    <html lang={locale} dir={dirFor(locale)}>
      <body>
        <I18nProvider locale={locale}>
          <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-forest-700 focus:px-4 focus:py-2 focus:text-white">{t("nav.skip")}</a>
          <SiteHeader />
          {gate?.pending && !gate.blocking ? <LocationGate blocking={false} /> : null}
          <main id="main">{gate?.blocking ? <LocationGate blocking /> : children}</main>
          <SiteFooter />
        </I18nProvider>
      </body>
    </html>
  );
}
