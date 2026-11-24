export function Logo({ className = "size-8" }: { className?: string }) {
  // A bridge arch over a meter tick: the product in one mark.
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" fill="none">
      <rect width="32" height="32" rx="7" fill="#1f4d3a" />
      <path d="M5 21h22" stroke="#f7f2e8" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M7 21c0-6 4-10 9-10s9 4 9 10" stroke="#f7f2e8" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M16 11v10M11.5 13v8M20.5 13v8" stroke="#86b698" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
