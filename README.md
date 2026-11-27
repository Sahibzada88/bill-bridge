# BillBridge — Bill Sponsorship & Financial Assistance Platform

A donor-driven platform where people struggling with utility bills can request help and donors pay the
**utility provider directly**. The platform **never holds money** (no wallet, no payment API). Every step
(review, questions, reservation, payment evidence, confirmation, disputes) is recorded and auditable.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · React Hook Form + Zod · Supabase (Postgres, Auth, Storage, RLS) · Lucide · Vercel-compatible. English + Urdu (RTL).

> **Read [Known limitations](#known-limitations) before launching.** Some parts could not be verified end-to-end in the environment this was built in.

---

## What is implemented

| Area | Implemented |
|---|---|
| **Auth** | Register, login, logout, email verification, password reset/change, role chosen at signup (`requester`/`donor` only), admin only via script, suspension, Cloudflare Turnstile CAPTCHA, Postgres rate limiting, **admin TOTP MFA (enforced in the database)** |
| **Requester** | Profile, create/edit request (financial fields lock once donors engage), upload bill + supporting docs with redaction controls, publish/cancel, answer donor questions, confirm/dispute payments, see who opened their documents, full event history, notifications |
| **Donor** | Browse/search/filter/sort, redacted previews, open original (when reserved), mark reviewed / satisfied, ask for more info, message requester, save, reserve, see payment details, submit payment evidence + receipt, contribution history, report requests, respond to disputes |
| **Verification** | The 9 statuses: Uploaded/not independently verified → Donor reviewed → Additional info requested → Information provided → Donor satisfied → Payment submitted → Requester confirmed / Payment disputed → Completed. UI always states donor reviews are **not** official verification |
| **Reservations** | 20 min default (`RESERVATION_MINUTES`), one active per request (partial unique index + row lock), safe expiry, cancellation, max 3 active per donor, blocked while a payment is unresolved |
| **Payments** | Evidence only: method, amount ≤ remaining, transaction reference, date, receipt. Duplicate-submission and duplicate-reference protection. Partial payments. Requester confirm / dispute → donor response → admin resolution |
| **Documents** | Private (server-only table or bucket), JPG/PNG/PDF, 5 MB server limit (4.5 MB on Vercel), real signature check, random names, EXIF stripped (image re-encode), PDFs rebuilt without scripts/attachments/annotations, redacted public preview, 60 s signed URLs (storage backend) or authorized streaming (database backend), access logs, SHA-256 duplicate detection |
| **Admin** | Stats, users (role/suspend), requests (remove/restore/unflag), reports, payment disputes, audit log, security monitor, MFA setup |
| **Public site** | Home, browse, request detail, how it works, about, contact, FAQ, safety, privacy, terms, transparency dashboard |
| **Login location** | Every login records an approximate network location (server-side) and asks the user to share their device location (browser permission). Required for donors/requesters by default (`LOCATION_POLICY`), admins never locked out. Refusals are recorded too. **Only admins (with MFA) can read it, only through audited SQL functions**; 12-month retention |
| **i18n** | English + Urdu, right-to-left layout, typed so a missing translation is a compile error |
| **Notifications** | In-app with unread badge, **plus email through Gmail (Google App Password)** via a database outbox (opt-out in Settings, throttled, retried, sent after the response). Contact form is forwarded to your inbox |
| **Files** | Stored as **base64 in Postgres** by default (zero extra setup) or in a private Storage bucket (`STORAGE_BACKEND`); the browser shrinks big photos to fit Vercel's 4.5 MB request limit |

## Quick start (local, ~10 minutes)

**→ Step-by-step in Roman Urdu + English: [docs/QUICKSTART.md](docs/QUICKSTART.md)** (local, live/Vercel, Gmail App Password).

```bash
# 1. Supabase: new free project -> SQL Editor -> paste supabase/setup_all.sql -> Run (once)
npm install
npm run setup        # asks for 3 Supabase keys (+ optional Gmail), writes .env.local, checks everything
npm run dev          # http://localhost:3000
npm run doctor       # re-check setup any time (database, Gmail, admin)
npm run make-admin -- you@example.com   # after you registered + verified email
```

Only **three** credentials are required (Supabase URL, anon key, service key). Gmail (App Password) is optional.
Uploaded bills/receipts are stored as **base64 inside Supabase Postgres** by default (no Storage bucket to configure);
set `STORAGE_BACKEND=storage` to use a Supabase Storage bucket instead.

More detail: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) · [docs/SECURITY.md](docs/SECURITY.md) · [docs/DATABASE.md](docs/DATABASE.md).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests (file/PDF/image security, validation, i18n, repo hygiene) |
| `npm run test:db` | Starts a **throwaway local PostgreSQL**, applies a Supabase stub + all migrations (and `setup_all.sql` on a second fresh DB), runs RLS/workflow/outbox tests and true concurrency races. Needs PostgreSQL 14+ binaries; touches no real database |
| `npm run setup` / `npm run doctor` | Guided `.env.local` creation / health check (Supabase, tables, Gmail, admin; `--send-test you@x.com` sends a real email) |
| `npm run make-admin -- <email>` | Promote a user to admin (service role) |
| `npm run build:sql` | Regenerate `supabase/setup_all.sql` from the migrations (a test keeps it in sync) |
| `npm run seed` | `[DEMO]` data for development only |

Everything is manual: **no GitHub Actions / CI / auto-deploy exist in this repo** (a test asserts it). Git, deploys and migrations are yours to run.

## Test results (what actually ran when this ZIP was built)

| Check | Result |
|---|---|
| `npm audit` | 0 vulnerabilities |
| `tsc --noEmit` | pass |
| `eslint .` | pass, 0 warnings |
| `next build` | pass (51 routes + proxy) |
| Vitest | **70 / 70 passed** (6 files) |
| `npm run test:db` | **141 assertions passed**; `supabase/setup_all.sql` applies cleanly to a fresh database with RLS on every table; concurrency: 8 simultaneous reservations → exactly **1** winner; 6 simultaneous payment submissions on one reservation → exactly **1** accepted |
| Production-server smoke test (no Supabase) | Security headers, per-request CSP nonce, route guard redirect, RTL switch, CSRF 403, unauthenticated upload 401, malformed ids 404, cron disabled without secret |

Bugs found *by* these tests and fixed during the build: PDF object-stream JavaScript bypass; orphaned annotation objects surviving PDF rebuild; a requester edit-lock trigger that errored under RLS; donors unable to file reports (RLS); untranslated admin error codes; HTTP 200 on missing pages (root `loading.tsx`).

## Known limitations

Please treat these as the honest list of what is **not** done or **not verified**:

1. **Not tested end-to-end against a live Supabase project or a real Gmail account.** No Docker/Supabase stack or credentials were available. The database layer *was* tested on real PostgreSQL 16 with a Supabase stub; the file store (base64 round-trip), email rendering and outbox SQL were unit/DB-tested; `doctor` was tested against a mock API; the Next.js server was smoke-tested. **Not** exercised live: Supabase Auth emails, PKCE callback, TOTP MFA enrolment, the actual Gmail SMTP login/send, real uploads through the API route, Turnstile, `seed-dev.mjs`, `make-admin.mjs`. Run `npm run doctor` first; expect small first-run fixes.
2. **No visual/browser verification.** The UI is mobile-first (Tailwind, logical RTL properties, 44 px targets) but was not rendered in a browser or checked at 320 px.
3. **PDF bills get no public preview** (rasterising PDFs needs native tooling unavailable on Vercel). They are sanitised and donors open the original after reserving.
4. **Redaction is manual, not automatic** (no OCR). Requesters choose which bands to black out; default is the top 35 %. Black boxes are baked into pixels, but requesters can still leave sensitive data uncovered.
5. **Duplicate detection is exact-match only** (SHA-256 of sanitised bytes). A re-photographed or edited bill is not detected.
6. **The platform cannot verify that a bill is real.** That is by design (donor-driven verification) and stated in the UI. Fraud remains possible; reports, disputes, and admin moderation are the mitigations.
7. **Email limits:** personal Gmail ≈ 500 emails/day; Supabase's custom-SMTP default is ≈ 30/hour (adjustable). Gmail App Passwords are fine for small projects; use a transactional email service if you grow.
7b. **Files in the database** count against the Supabase database size (free ≈ 500 MB, base64 is +33 %). Vercel rejects request bodies > 4.5 MB (photos are shrunk in the browser; PDFs must already be small).
7c. **CAPTCHA is optional by default** (`ALLOW_MISSING_CAPTCHA=true`) to make setup easy; logins and registrations stay rate-limited. Add free Turnstile keys before a public launch.
8. **No automatic payment verification.** Easypaisa/JazzCash have no integration; the requester is the source of truth.
9. Admin screens show names, not emails (emails live in `auth.users`; use the Supabase dashboard).
10. Legal pages are **templates**; have a lawyer review. Urdu text should be reviewed by a native speaker. Fonts are system fonts (no bundled Nastaliq).
11. `NEXT_PUBLIC_*` variables are baked in **at build time**; set them before building.
12. Account self-deletion and data export are not self-service.
13. **Login location is evidence, not proof.** VPNs and fake-GPS apps can fake it; the network-derived location is approximate (city level, and empty when running locally). Browsers only share GPS if the user clicks Allow, so the app can require it before use but cannot take it silently. The block is enforced in the UI, in server actions and in the file routes, but not on every possible read. It needs HTTPS (works on `localhost` and Vercel). **Collecting location has legal duties** (consent notice, purpose, retention, access control): the privacy page has a template section, but have a lawyer confirm it for your country. Users cannot see their own location rows (admin-only, as requested); consider adding that for transparency.
14. Rate limiting trusts `x-forwarded-for` (correct on Vercel; configure your proxy elsewhere).

## Project layout

```
supabase/setup_all.sql ALL migrations in one file (paste once in SQL Editor)
supabase/migrations/   schema · workflow functions · RLS/grants/views/storage · files-in-db + email outbox
supabase/optional/     pg_cron maintenance (optional)
src/proxy.ts           per-request CSP nonce, session refresh, /dashboard guard
src/lib/file-store.ts  base64-in-database or Storage backend
src/lib/email.ts       Gmail (App Password) outbox sender
src/lib/security/      file sniffing, PDF/image sanitising, rate limit, CAPTCHA, CSRF, hashing
src/actions/           Server Actions (validate → rate-limit → call DB function under the user's session)
src/app/api/           document upload / signed URL / delete, cron, health
src/app/               pages (public, auth, dashboard/requester|donor|admin)
tests/                 vitest + tests/db (SQL RLS + concurrency)
docs/                  SECURITY.md · DATABASE.md · DEPLOYMENT.md
```
