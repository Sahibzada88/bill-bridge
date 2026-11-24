import type { NextConfig } from "next";

const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host;
  } catch {
    return "";
  }
})();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["sharp", "pdf-lib"],
  experimental: {
    serverActions: { bodySizeLimit: "6mb" },
  },
  images: {
    remotePatterns: supabaseHost ? [{ protocol: "https", hostname: supabaseHost }] : [],
  },
  async headers() {
    // The per-request CSP (with nonce) is set in src/proxy.ts. These are the static headers.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
