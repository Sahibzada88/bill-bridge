export function PageShell({ title, intro, children, narrow }: { title: string; intro?: string; children: React.ReactNode; narrow?: boolean }) {
  return (
    <div className={`mx-auto px-4 py-10 sm:py-14 ${narrow ? "max-w-3xl" : "max-w-6xl"}`}>
      <h1 className="font-display text-3xl font-semibold text-forest-900 sm:text-4xl">{title}</h1>
      {intro ? <p className="mt-3 max-w-2xl text-lg text-muted">{intro}</p> : null}
      <div className="mt-8">{children}</div>
    </div>
  );
}
