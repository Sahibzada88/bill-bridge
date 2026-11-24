import { requireRole } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { Card, CardBody } from "@/components/ui/card";
import { RequestForm } from "@/components/requester/request-form";

export const metadata = { title: "New request" };

export default async function NewRequestPage() {
  await requireRole("requester");
  const { t } = await getT();
  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-semibold text-forest-900">{t("rf.new")}</h1>
      <p className="text-muted">{t("rf.draftHelp")}</p>
      <Card><CardBody className="pt-5"><RequestForm /></CardBody></Card>
    </div>
  );
}
