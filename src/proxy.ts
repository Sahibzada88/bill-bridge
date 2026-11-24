import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV !== "production";
  let supabaseOrigin = "";
  let supabaseWs = "";
  try {
    const u = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    supabaseOrigin = u.origin;
    supabaseWs = `wss://${u.host}`;
  } catch { /* not configured */ }

  const directives = [
    `default-src 'self'`,
    // 'strict-dynamic' lets the nonce'd bootstrap load Next chunks; Turnstile is loaded with the nonce too.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data: ${supabaseOrigin}`.trim(),
    `font-src 'self'`,
    `connect-src 'self' ${supabaseOrigin} ${supabaseWs} https://challenges.cloudflare.com`.replace(/\s+/g, " ").trim(),
    `frame-src https://challenges.cloudflare.com`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    ...(isDev ? [] : [`upgrade-insecure-requests`]),
  ];
  return directives.join("; ");
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let isAuthed = false;

  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    // getClaims verifies the JWT signature locally (refreshing the session when needed).
    const { data } = await supabase.auth.getClaims();
    isAuthed = !!data?.claims;
  }

  const path = request.nextUrl.pathname;
  if (path.startsWith("/dashboard") && !isAuthed) {
    const redirect = NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(path + request.nextUrl.search)}`, request.url));
    redirect.headers.set("Content-Security-Policy", csp);
    return redirect;
  }

  response.headers.set("Content-Security-Policy", csp);
  // Authenticated and API responses must never be cached by shared caches.
  if (path.startsWith("/dashboard") || path.startsWith("/api")) response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
