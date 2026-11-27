import { z } from "zod";

/** Public (browser-safe) configuration. Must be referenced literally so Next can inline it. */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "",
};

export function assertPublicEnv() {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill it in.",
    );
  }
}

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20, "SUPABASE_SERVICE_ROLE_KEY is required"),
  // Optional: if unset, a salt is derived from the service-role key (see lib/security/ip.ts).
  IP_HASH_SALT: z.string().min(16, "IP_HASH_SALT must be at least 16 characters").optional(),
  TURNSTILE_SECRET_KEY: z.string().optional().default(""),
  ALLOW_MISSING_CAPTCHA: z.enum(["true", "false"]).optional().default("true"),
  // "true" when CAPTCHA protection is enabled in Supabase Auth settings: the token is then forwarded to
  // Supabase (which verifies it, closing the direct-API bypass) instead of being verified by this app.
  SUPABASE_AUTH_CAPTCHA: z.enum(["true", "false"]).optional().default("false"),
  RESERVATION_MINUTES: z.coerce.number().int().min(5).max(60).optional().default(20),
  DONOR_ORIGINAL_ACCESS: z.enum(["reserved", "verified"]).optional().default("reserved"),
  CRON_SECRET: z.string().optional().default(""),
  // Login location: "required" (users must allow it; admins are asked but never locked out), "requested" (asked, may skip), "off".
  LOCATION_POLICY: z.enum(["required", "requested", "off"]).optional().default("required"),
  // Where uploaded files live: "database" (base64 in Postgres, zero extra setup) or "storage" (Supabase Storage bucket).
  STORAGE_BACKEND: z.enum(["database", "storage"]).optional().default("database"),
  // Gmail SMTP with a Google App Password (optional; email features are skipped when unset).
  GMAIL_USER: z.string().email().optional().or(z.literal("")).default(""),
  GMAIL_APP_PASSWORD: z.string().optional().default(""),
  CONTACT_TO: z.string().email().optional().or(z.literal("")).default(""),
});

export type ServerEnv = z.infer<typeof serverSchema>;
let cached: ServerEnv | null = null;

/** Server-only configuration, validated lazily on first use. */
export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid server environment: ${msg}`);
  }
  cached = parsed.data;
  return cached;
}

export const isProd = process.env.NODE_ENV === "production";
