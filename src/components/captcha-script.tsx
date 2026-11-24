import Script from "next/script";
import { headers } from "next/headers";
import { publicEnv } from "@/lib/env";

/** Loads the Turnstile script with the request's CSP nonce (only on pages that need it). */
export async function CaptchaScript() {
  if (!publicEnv.turnstileSiteKey) return null;
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" nonce={nonce} strategy="afterInteractive" />;
}
