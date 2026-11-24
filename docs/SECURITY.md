# Security

Design principle: **the database is the authority.** The app validates and rate-limits, but RLS, column grants
and `SECURITY DEFINER` functions are what actually enforce rules, so a bug (or a forged request) in the app
layer cannot bypass them. "Verified by" below names the test that exercises the control.

## Threat → control

| Threat | Control | Verified by |
|---|---|---|
| **SQL injection** | No string-built SQL. PostgREST/supabase-js parameterize; all DB logic is in fixed SQL functions with typed args; `search_path = ''` on every definer function; user search text is stripped of filter metacharacters and uses `plainto_tsquery` | `validation.test` (sanitizer, injection-shaped refs), DB test "every SECURITY DEFINER function pins search_path" |
| **XSS** | React escapes output; no `dangerouslySetInnerHTML`; strict CSP with per-request nonce + `strict-dynamic`, `object-src 'none'`, `frame-ancestors 'none'`; user-uploaded SVG/HTML rejected (only JPG/PNG/PDF); files served only via signed URLs from a different origin | smoke test (CSP + nonce), `security-files.test` |
| **CSRF** | Server Actions: Next.js Origin check. Route Handlers: explicit same-origin check on every mutating route. Cookies SameSite=Lax | `validation.test` (origin logic), smoke test (403s) |
| **IDOR** | Every read/write is under the caller's RLS; workflow functions re-check ownership (`request_not_found` for other users' ids, same as missing); document routes return an identical 404 for "missing" and "forbidden" | DB tests (other requester cannot read/update/cancel/answer/dispute) |
| **Brute force / credential stuffing** | Per-IP and per-account Postgres rate limits, CAPTCHA, generic "email or password incorrect", Supabase Auth limits; failed logins logged | code review; DB rate-limit table unreachable by clients (DB test) |
| **Unauthorized document access** | Database backend: `document_blobs` has RLS on, no policies, no client grants. Storage backend: bucket private with **zero** storage policies. Either way the server authorizes, logs, then streams (database) or issues 60 s / 300 s signed URLs (storage). Originals need an active reservation (default). File responses carry `nosniff`, `no-store`, `no-referrer` | DB tests (blob + storage isolation), base64 round-trip unit test, code review of `lib/documents.ts` |
| **Role escalation** | `role` is not in any client-grantable column; signup trigger only ever yields `requester`/`donor` (metadata `admin` ignored); `admin_set_role` needs an admin (aal2) or the service role; cannot change own role; last admin protected; no authorization ever reads user-editable `user_metadata` | DB tests (self-promotion denied, `role=admin` signup ignored, own role/suspend denied) |
| **Admin takeover** | Admin DB policies and functions require `aal2` (TOTP) via `is_admin()`; MFA flag lives in `app_settings` (service-role only) | DB test (aal1 admin reads 0 payments and is `forbidden`) |
| **Race conditions** | Partial unique index (one active reservation/request) + `SELECT … FOR UPDATE` on the request row; one payment per reservation; request row locked on confirm/dispute | DB concurrency test: 8 simultaneous reservations → 1 winner; 6 simultaneous payments → 1 accepted |
| **Duplicate payments** | Unique `(reservation_id)`, unique receipt document, unique `(request_id, lower(transaction_ref))`; amount ≤ remaining; date window | DB tests |
| **Mass assignment** | Column-level `GRANT INSERT/UPDATE` lists; Zod schemas strip unknown keys; protected columns (`lifecycle`, `verification_status`, `amount_paid`, `role`, `is_suspended`, `flagged`) are not grantable | DB tests ("permission denied" on each), `validation.test` |
| **File upload attacks** | Size cap before buffering; magic-byte sniff (not extension/Content-Type); declared/detected mismatch rejected; images decoded and re-encoded (EXIF/GPS/polyglot payloads dropped, 40 MP decompression-bomb limit); PDFs scanned (byte + parsed-object, `#xx` name obfuscation) then **rebuilt** from page content only, annotations/actions removed, ≤10 pages; random server-generated names; display names sanitized and never used as paths | `security-files.test` (20 tests, incl. JS in compressed object streams, annotation stripping, EXIF removal verified by re-reading the output) |
| **Sensitive information leakage** | Public views expose explicit safe columns only (first name, no contact info); consumer/reference number visible only to the requester and a donor with an active reservation or own payment; admins **cannot** read private messages; raw DB errors never sent to clients; IPs stored only as salted hashes; service-role key is server-only (`server-only` import) | DB tests, bundle scan (no secret in `.next/static`), `i18n.test` hygiene checks |
| **Enumeration** | Same registration / password-reset responses regardless of account existence | code review |
| **Open redirect** | `next` parameters validated to same-site relative paths | `validation.test` |
| **Fake payment confirmation** | Only the requester (or an admin resolving a dispute) can mark a payment confirmed; there is no donor-side confirm path | DB tests |

## Email
- Notification emails contain only translated dictionary text and a link built from the configured site URL plus a validated relative path (cannot be turned into a phishing link; tested). No user-supplied text is placed in subjects or headers (contact-form names are stripped of line breaks).
- The Gmail App Password lives only in server environment variables. Use an App Password (revocable at any time), never the account password.
- `email_outbox` is server-only (RLS on, no grants); recipients' addresses are read by the service role at send time.

## Defaults you may want to tighten
- `ALLOW_MISSING_CAPTCHA=true` is the default so setup is easy. Logins/registrations remain rate-limited, but add Turnstile keys before a public launch and consider `false`.
- Files in the database add to DB size and backups; they remain inaccessible to clients.

## Things that are deliberately *not* secured by the platform
- Whether a bill is genuine (donor-driven; labelled as such everywhere).
- Whether a donor really paid (the requester confirms; disputes go to an admin).
- Contact details a user types into a free-text message (UI warns against sharing secrets).

## Operational notes
- Rotate the service-role key if it is ever exposed; it bypasses RLS.
- Keep `require_admin_mfa = true` in production.
- Review the `security_events` (`suspicious_*`) and `audit_logs` tables via the admin dashboard.
- `rate_limits` rows older than a day are removed by `cleanup_rate_limits()` (cron optional).
- Dependencies: `npm audit` reported 0 vulnerabilities at build time; re-run periodically.
