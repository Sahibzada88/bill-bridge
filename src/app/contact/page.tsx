import { getT } from "@/lib/i18n/server";
import { PageShell } from "@/components/page-shell";
import { CaptchaScript } from "@/components/captcha-script";
import { ContactForm } from "@/components/forms/contact-form";
export const metadata = { title: "Contact" };
export default async function ContactPage() {
  const { t } = await getT();
  return (
    <PageShell title={t("pub.contact.title")} intro={t("pub.contact.body")} narrow>
      <CaptchaScript />
      <ContactForm />
    </PageShell>
  );
}
