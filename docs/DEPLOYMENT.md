# Deployment (manual)

> **Short version: [QUICKSTART.md](QUICKSTART.md).** This page is the detailed reference.

Nothing here is automated. You run every step.

## 1. Create the Supabase project
Dashboard → New project. Note: Project URL, `anon`/publishable key, and the **service role / secret key** (server-only).

## 2. Apply the migrations (in order)
Easiest: paste `supabase/setup_all.sql` (all migrations in one file) into **SQL Editor** and run it **once** on a new project. Or run the numbered files one by one, or use the CLI manually:

```bash
supabase link --project-ref <ref>
supabase db push          # applies supabase/migrations/*.sql in filename order
```
Order: `…0001_schema.sql` → `…0002_functions.sql` → `…0003_rls_grants_views.sql` → `…0004_files_in_db_and_email.sql`.

Verify afterwards (SQL Editor):
```sql
select tablename from pg_tables where schemaname='public' and not rowsecurity;  -- must return 0 rows
select id, public from storage.buckets where id='documents';                    -- public = false
```
Supabase "Security Advisor" will flag three views as security-definer. That is **intentional**: `public_request_cards`, `profile_names`, `platform_stats` expose explicit safe column lists to anonymous visitors without granting any access to base tables.

## 3. Authentication settings (Dashboard → Authentication)
- **URL Configuration:** Site URL = your production URL; add `https://YOUR_DOMAIN/auth/callback` (and `http://localhost:3000/auth/callback`) to Redirect URLs.
- **Providers → Email:** enable; **Confirm email = ON**; minimum password length **10**.
- **Email templates** (recommended, so links work when opened on another device). In *Confirm signup* and *Reset password* use:
  - Confirm: `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup&next=/dashboard`
  - Reset: `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`
- **SMTP:** configure your own SMTP provider for production (default sender is severely rate-limited).
- **Multi-factor:** TOTP must be enabled (default on hosted projects). Admins are forced to enrol it.
- **Rate limits:** keep Supabase's Auth rate limits enabled; the app adds its own on top.

### CAPTCHA (Cloudflare Turnstile, free)
1. Create a Turnstile widget; set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`.
2. **Choose one verifier:**
   - *App verifies* (default): leave `SUPABASE_AUTH_CAPTCHA=false`. Note the public Supabase Auth API can still be called directly with the anon key, bypassing this check.
   - *Supabase verifies* (recommended for production): Dashboard → Authentication → Attack Protection → enable CAPTCHA (Turnstile, same secret) and set `SUPABASE_AUTH_CAPTCHA=true`. The app forwards the token and does **not** verify it a second time (tokens are single-use). This also protects direct API calls.
3. With no Turnstile secret, forms work (rate-limited) because `ALLOW_MISSING_CAPTCHA` defaults to `true` for easy setup. Set it to `false` to make production **refuse** logins/registrations until CAPTCHA is configured.

## 4. File storage (choose one; default needs no setup)
- **`STORAGE_BACKEND=database` (default):** files are base64 text in `public.document_blobs`, a table with RLS on, **no policies and no grants** for clients (verified by tests). The server streams a file only after authorizing and logging the request. Nothing to configure.
- **`STORAGE_BACKEND=storage`:** the `documents` bucket (created by migration 3) is **private**, 5 MB, JPG/PNG/PDF, with **no storage policies**; the server issues 60-second signed URLs. Do **not** add public policies.
- Switching later is safe: reads follow each file's path (`db:` prefix = database), so old files stay readable.
- Mind database size (free tier ≈ 500 MB; base64 adds 33 %).

## 4b. Email (Gmail App Password)
See QUICKSTART §B. App emails use `GMAIL_USER` + `GMAIL_APP_PASSWORD` (Nodemailer over `smtp.gmail.com:465`). Supabase's own signup/reset emails use the same credentials entered under *Authentication → SMTP Settings*. Queue: `email_outbox` (filled by a trigger on `notifications`), flushed after each action and by `/api/cron/expire-reservations`.

## 5. Environment variables

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | build-time |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | build-time |
| `NEXT_PUBLIC_SITE_URL` | yes | build-time; used in email redirect URLs |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | **server only**, never `NEXT_PUBLIC_` |
| `STORAGE_BACKEND` | no | `database` (default) or `storage` |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `CONTACT_TO` | no | Gmail App Password emails; skipped when unset |
| `IP_HASH_SALT` | no | derived from the service key if unset |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | prod | CAPTCHA |
| `SUPABASE_AUTH_CAPTCHA` | no | `true` if Supabase verifies CAPTCHA |
| `ALLOW_MISSING_CAPTCHA` | no | default `false` (dev works without keys; prod does not) |
| `RESERVATION_MINUTES` | no | 5–60, default 20 |
| `DONOR_ORIGINAL_ACCESS` | no | `reserved` (default) or `verified` |
| `CRON_SECRET` | no | enables `/api/cron/expire-reservations` |

`NEXT_PUBLIC_*` values are embedded at **build** time. Set them before `next build`.

## 6. Deploy to Vercel (manual)
```bash
npm i -g vercel
vercel                 # link the project, set env vars in the dashboard, then:
vercel --prod
```
(or import the project in the Vercel dashboard). The route `/api/documents` uses the Node runtime (sharp, pdf-lib). No GitHub integration is required.

## 7. First admin
1. Register normally and verify the email.
2. `node --env-file=.env.local scripts/make-admin.mjs you@example.com`
3. Log in → you are redirected to `/dashboard/admin/mfa` → enrol TOTP → admin area unlocks.

(Optional dev switch: `update app_settings set value='false' where key='require_admin_mfa';` disables MFA enforcement. Never in production.)

## 8. Optional maintenance
`supabase/optional/pg_cron_maintenance.sql` (pg_cron) or call `/api/cron/expire-reservations` with `Authorization: Bearer $CRON_SECRET` from a scheduler you control. Correctness does not depend on it.

## 9. Post-deploy checklist
- [ ] `npm run doctor` shows no ✘
- [ ] Both RLS queries in step 2 return what is expected
- [ ] Register → verify email → log in works
- [ ] Upload a JPG bill (try a >4.5 MB photo: it should shrink); the public preview is covered; the original opens only after reserving
- [ ] Reserve from a second browser → "already reserved"
- [ ] Admin cannot reach `/dashboard/admin` without TOTP
- [ ] `SUPABASE_SERVICE_ROLE_KEY` appears in no client bundle (`grep -r` the `.next/static` folder)
- [ ] Custom SMTP + Turnstile configured; legal pages reviewed by a lawyer
