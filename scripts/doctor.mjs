#!/usr/bin/env node
/**
 * Checks that setup is complete and tells you exactly what to fix.
 *   npm run doctor                 (reads .env.local)
 *   npm run doctor -- --send-test you@example.com    (also sends a real test email)
 */
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
else if (existsSync(".env")) process.loadEnvFile(".env");
const env = process.env;
let fails = 0, warns = 0;
const ok = (m) => console.log(`  \x1b[32m✔\x1b[0m ${m}`);
const bad = (m, fix) => { fails++; console.log(`  \x1b[31m✘\x1b[0m ${m}${fix ? `\n      → ${fix}` : ""}`); };
const warn = (m, fix) => { warns++; console.log(`  \x1b[33m!\x1b[0m ${m}${fix ? `\n      → ${fix}` : ""}`); };

console.log("\nBillBridge doctor\n");
console.log("1. Settings (.env.local)");
const url = env.NEXT_PUBLIC_SUPABASE_URL, anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, service = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !service) bad("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY", "run: npm run setup");
else {
  ok("Supabase URL and both keys are set");
  if (anon === service) bad("anon key and service key are identical", "copy the two DIFFERENT keys from Project Settings → API");
}
const backend = env.STORAGE_BACKEND || "database";
ok(`Files are kept in: ${backend === "database" ? "the database (base64) - no Storage setup needed" : "Supabase Storage bucket 'documents'"}`);
const site = env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
ok(`Site URL: ${site}`);
if (site.startsWith("https://") && !(env.TURNSTILE_SECRET_KEY && env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)) warn("Live site without CAPTCHA (Turnstile). Login/register are still rate-limited, but bots can try.", "free keys at dash.cloudflare.com → Turnstile; set NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY");

if (url && service && anon !== service) {
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  console.log("\n2. Database");
  // GET with one tiny column (HEAD requests carry no error body, so failures would be unreadable).
  const probe = async (table, col) => admin.from(table).select(col).limit(1);
  const a = await probe("app_settings", "key");
  if (a.error) {
    if (/Invalid API key|JWT|apikey/i.test(a.error.message)) bad("Supabase rejected the service key", "re-copy the service_role / secret key");
    else if (a.error.code === "PGRST205" || a.error.code === "42P01" || /schema cache|does not exist/i.test(a.error.message)) bad("Database tables not found: the SQL has not been run yet", "Supabase → SQL Editor → paste supabase/setup_all.sql → Run");
    else bad(`Cannot reach the database: ${a.error.message}`, "check the URL; is the project paused?");
  } else {
    ok("Tables exist (migrations applied)");
    const b = await probe("document_blobs", "path");
    if (b.error) bad("File table missing (migration 0004 not applied)", "re-create the project and run supabase/setup_all.sql (it includes 0004)");
    else ok("Base64 file table exists");
    const e = await probe("email_outbox", "id");
    if (e.error) bad("Email outbox missing (migration 0004 not applied)", "run supabase/setup_all.sql on a fresh project");
    if (backend === "storage") {
      const { data: buckets } = await admin.storage.listBuckets();
      const bk = buckets?.find((x) => x.id === "documents");
      if (!bk) bad("Storage bucket 'documents' not found", "run supabase/setup_all.sql or create a PRIVATE bucket named documents");
      else if (bk.public) bad("Bucket 'documents' is PUBLIC - bills would be exposed", "Storage → documents → make it private");
      else ok("Storage bucket 'documents' exists and is private");
    }
    const adm = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
    if (!adm.error) {
      if ((adm.count ?? 0) > 0) ok(`${adm.count} admin account(s) exist`);
      else warn("No admin yet", "register on the site, verify email, then: npm run make-admin -- you@example.com");
    }
    const mfa = await admin.from("app_settings").select("value").eq("key", "require_admin_mfa").maybeSingle();
    if (mfa.data?.value === "true") ok("Admin MFA (authenticator app) is enforced"); else warn("Admin MFA is OFF", "fine for local testing only");
  }
  console.log("\n3. Supabase Auth");
  const u = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (u.error) bad(`Auth API error: ${u.error.message}`); else ok("Auth API reachable");
}

console.log("\n4. Gmail (App Password)");
if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) warn("Gmail not configured: notification emails + contact-form emails are skipped", "set GMAIL_USER and GMAIL_APP_PASSWORD (see docs/QUICKSTART.md)");
else {
  const t = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD.replace(/\s+/g, "") }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 });
  try {
    await t.verify(); ok(`Gmail login works for ${env.GMAIL_USER}`);
    const i = process.argv.indexOf("--send-test");
    if (i > -1 && process.argv[i + 1]) { await t.sendMail({ from: env.GMAIL_USER, to: process.argv[i + 1], subject: "BillBridge test email", text: "If you can read this, Gmail is set up correctly." }); ok(`Test email sent to ${process.argv[i + 1]}`); }
  } catch (e) {
    const m = String(e?.message ?? e);
    if (/Invalid login|535|Username and Password not accepted|EAUTH/i.test(m)) bad("Gmail rejected the login", "use a Google APP PASSWORD (16 letters), not your normal password; 2-Step Verification must be ON");
    else bad(`Gmail connection failed: ${m}`, "check internet/firewall (port 465)");
  }
}
console.log(`\n${fails ? "\x1b[31mNot ready:\x1b[0m" : "\x1b[32mReady.\x1b[0m"} ${fails} problem(s), ${warns} warning(s).\n`);
process.exit(fails ? 1 : 0);
