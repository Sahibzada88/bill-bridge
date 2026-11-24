/**
 * CSRF defense for Route Handlers (Server Actions already get Origin checks from Next.js).
 * Mutating requests must come from our own origin. Session cookies are also SameSite=Lax.
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return false; // browsers always send Origin on cross-site POSTs
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
