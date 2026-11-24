import { Card, CardBody } from "@/components/ui/card";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-md px-4 py-10 sm:py-16">
      <h1 className="font-display text-3xl font-semibold text-forest-900">{title}</h1>
      {subtitle ? <p className="mt-1 text-muted">{subtitle}</p> : null}
      <Card className="mt-6"><CardBody className="pt-5">{children}</CardBody></Card>
      {footer ? <p className="mt-5 text-center text-sm text-muted">{footer}</p> : null}
    </div>
  );
}
