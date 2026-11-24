#!/usr/bin/env node
/**
 * DEVELOPMENT SEED DATA ONLY. Creates clearly-labelled DEMO users and requests so you can click around.
 * Refuses to run against anything that is not a local/dev project unless you pass --force-i-understand.
 *
 *   node --env-file=.env.local scripts/seed-dev.mjs
 *
 * Demo accounts (password for all: DemoPass-12345):
 *   demo.requester@example.test   demo.donor@example.test   demo.admin@example.test
 * Every record is prefixed "[DEMO]". Do NOT run this in production.
 */
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { createHash, randomBytes } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(2); }
if (process.env.NODE_ENV === "production" && !process.argv.includes("--force-i-understand")) {
  console.error("Refusing to seed demo data with NODE_ENV=production."); process.exit(2);
}
console.warn("!! Seeding DEMO data into", new URL(url).host, "— make sure this is a development project.");

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const PASSWORD = "DemoPass-12345";
const sha = (b) => createHash("sha256").update(b).digest("hex");

async function ensureUser(email, role, fullName, extra = {}) {
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  let u = list?.users.find((x) => x.email === email);
  if (!u) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { role: role === "admin" ? "donor" : role, full_name: fullName } });
    if (error) throw error;
    u = data.user;
  }
  await admin.from("profiles").update({ full_name: fullName, ...extra }).eq("id", u.id);
  if (role === "admin") await admin.from("profiles").update({ role: "admin" }).eq("id", u.id);
  return u;
}

async function fakeBill(label, amount) {
  // A synthetic, obviously fake bill image (no real data). Shapes only, so no font dependency.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#fff"/>
  <rect x="0" y="0" width="800" height="120" fill="#cfe3d6"/><rect x="40" y="150" width="420" height="22" fill="#222"/><rect x="40" y="190" width="300" height="16" fill="#666"/>
  <rect x="40" y="260" width="720" height="2" fill="#999"/><rect x="40" y="300" width="${200 + (amount % 300)}" height="30" fill="#444"/>
  <rect x="500" y="700" width="260" height="60" fill="#1f4d3a"/><rect x="40" y="900" width="720" height="40" fill="#ddd"/>
  <text x="40" y="80" font-size="40" fill="#1f4d3a">DEMO BILL ${label}</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}

const requester = await ensureUser("demo.requester@example.test", "requester", "[DEMO] Ayesha Khan", { phone: "+923001112233", city: "Islamabad" });
await ensureUser("demo.donor@example.test", "donor", "[DEMO] Bilal Raza");
await ensureUser("demo.admin@example.test", "admin", "[DEMO] Admin User");

const samples = [
  ["[DEMO] Electricity bill, widowed mother of three", "electricity", "IESCO", "Islamabad", 8400],
  ["[DEMO] Gas bill after medical expenses", "gas", "SNGPL", "Lahore", 3200],
  ["[DEMO] Water bill for a family of five", "water", "WASA", "Rawalpindi", 1800],
  ["[DEMO] Internet for online classes", "internet", "PTCL", "Karachi", 4500],
];
for (const [i, [title, type, provider, city, amount]] of samples.entries()) {
  const { data: existing } = await admin.from("requests").select("id").eq("title", title).maybeSingle();
  if (existing) { console.log("exists:", title); continue; }
  const due = new Date(Date.now() + (5 + i * 3) * 86400000).toISOString().slice(0, 10);
  const { data: r, error } = await admin.from("requests").insert({
    requester_id: requester.id, title, utility_type: type, provider_name: provider, city, amount_due: amount, due_date: due,
    description: "This is DEMO data created by scripts/seed-dev.mjs. It does not describe a real person or a real bill.",
  }).select("id").single();
  if (error) throw error;
  await admin.from("request_payment_details").insert({ request_id: r.id, consumer_ref: `DEMO-${1000 + i}-${amount}`, account_title: "[DEMO]" });

  const original = await fakeBill(`#${i + 1}`, amount + i * 37);
  const preview = await sharp(original).composite([{ input: await sharp({ create: { width: 800, height: 350, channels: 3, background: "#000" } }).png().toBuffer(), top: 0, left: 0 }]).resize({ width: 600 }).jpeg({ quality: 70 }).toBuffer();
  const base = `${r.id}/${randomBytes(16).toString("hex")}`;
  const useDb = (process.env.STORAGE_BACKEND || "database") !== "storage";
  const pOrig = useDb ? `db:${base}.jpg` : `${base}.jpg`, pPrev = useDb ? `db:${base}_preview.jpg` : `${base}_preview.jpg`;
  if (useDb) {
    const b = (path, buf) => admin.from("document_blobs").insert({ path, mime_type: "image/jpeg", data_base64: buf.toString("base64") });
    for (const res of [await b(pOrig, original), await b(pPrev, preview)]) if (res.error) throw res.error;
  } else {
    await admin.storage.from("documents").upload(pOrig, original, { contentType: "image/jpeg" });
    await admin.storage.from("documents").upload(pPrev, preview, { contentType: "image/jpeg" });
  }
  await admin.from("documents").insert({ request_id: r.id, owner_id: requester.id, kind: "bill", storage_path: pOrig, preview_path: pPrev,
    display_name: "demo-bill.jpg", mime_type: "image/jpeg", size_bytes: original.length, sha256: sha(original), redaction: { top: 35 } });
  await admin.from("requests").update({ lifecycle: "open", published_at: new Date().toISOString() }).eq("id", r.id);
  console.log("created:", title);
}
console.log("\nDone. Log in with any demo account, password:", PASSWORD, "(admin must enrol MFA first).");
