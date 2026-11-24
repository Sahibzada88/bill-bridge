#!/usr/bin/env node
/**
 * Promote an existing user to admin. This is the ONLY supported way to create the first admin
 * (users can never self-promote; the app has no "become admin" path).
 *
 *   node --env-file=.env.local scripts/make-admin.mjs someone@example.com
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. The user must already have registered
 * and verified their email. They will then be forced to enrol TOTP MFA on first admin login.
 */
import { createClient } from "@supabase/supabase-js";

const email = (process.argv[2] ?? "").trim().toLowerCase();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!email || !email.includes("@")) { console.error("Usage: node --env-file=.env.local scripts/make-admin.mjs user@example.com"); process.exit(2); }
if (!url || !key) { console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment."); process.exit(2); }

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

let user = null;
for (let page = 1; page <= 50 && !user; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) { console.error("Could not list users:", error.message); process.exit(1); }
  user = data.users.find((u) => (u.email ?? "").toLowerCase() === email) ?? null;
  if (data.users.length < 200) break;
}
if (!user) { console.error(`No user with email ${email}. Register first, verify the email, then re-run.`); process.exit(1); }
if (!user.email_confirmed_at) { console.error("That user has not verified their email yet."); process.exit(1); }

// Preferred path: the audited SQL function (writes audit_logs + security_events).
let { error } = await admin.rpc("admin_set_role", { p_user: user.id, p_role: "admin" });
if (error) {
  console.warn("admin_set_role RPC failed (" + error.message + "); falling back to a direct update.");
  ({ error } = await admin.from("profiles").update({ role: "admin" }).eq("id", user.id));
}
if (error) { console.error("Failed:", error.message); process.exit(1); }
console.log(`OK: ${email} is now an admin. They must enrol TOTP MFA at /dashboard/admin/mfa on first login.`);
