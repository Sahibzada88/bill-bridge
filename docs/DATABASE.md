# Database

PostgreSQL via Supabase. Five ordered migrations in `supabase/migrations/` (also bundled in `supabase/setup_all.sql`):

1. `…0001_schema.sql` – enums, tables, indexes, `updated_at` triggers, signup→profile trigger
2. `…0002_functions.sql` – workflow functions, guards, notification/audit helpers, admin functions
3. `…0003_rls_grants_views.sql` – RLS enable + policies, column grants, function grants, public views, private storage bucket
4. `…0004_files_in_db_and_email.sql` – `document_blobs` (base64 files), `email_outbox` + trigger, `profiles.email_notifications`, `claim_email_outbox` / `finish_email`
5. `…0005_service_role_grants.sql` – grants server-only table/sequence access to `service_role` and sets defaults for future objects

## State machines

**Request lifecycle** (`requests.lifecycle`): `draft → open → reserved → payment_pending → completed`
(`reserved → open` on expiry/cancel; `payment_pending → open` after partial confirm or an invalid dispute; `draft|open|reserved → cancelled`; admin `→ removed ⇄ open`).

**Verification status** (`requests.verification_status`):
`uploaded_unverified → donor_reviewed → info_requested ⇄ info_provided → donor_satisfied → payment_submitted → requester_confirmed | payment_disputed → completed`

Only workflow functions can change either column.

## Tables

| Table | Purpose | Client access (RLS) |
|---|---|---|
| `profiles` | role, contact, suspension | own row; admin read; update only name, phone, city, bio, locale (and last_seen_at) |
| `requests` | the assistance request | owner select/insert/update (limited columns, only while draft/open); admin select |
| `request_payment_details` | full consumer/reference number | requester; donor with active reservation or own payment; admin |
| `documents` | metadata only (files in Storage) | owner / request owner / admin read. **No client writes** |
| `document_access_logs` | who opened what | request owner, admin read. Writes: server only |
| `reservations` | one active per request | donor, request owner, admin read |
| `donor_reviews`, `info_requests` | donor-driven verification | participants + admin read |
| `threads`, `messages` | internal messaging | participants only (not admins) |
| `saved_requests` | donor bookmarks | own |
| `payments` | evidence, never money | donor, request owner, admin read |
| `request_events` | per-request audit history | request owner, actor, admin |
| `audit_logs`, `security_events` | admin/security trail | admin (own security events visible to the user) |
| `notifications` | in-app | own (only `read_at` updatable) |
| `reports` | user reports | reporter inserts/reads own; admin |
| `app_settings` | feature flags (e.g. `require_admin_mfa`) | admin read; writes service role |
| `rate_limits`, `contact_messages`, `document_blobs`, `email_outbox` | server-only | RLS on, no client policies, no client grants |

Views (explicit safe columns, owner-rights on purpose): `public_request_cards`, `profile_names`, `platform_stats`.

## Functions (all `SECURITY DEFINER`, `search_path = ''`)

Client-callable: `reserve_request`, `cancel_reservation`, `submit_request`, `cancel_request`, `mark_reviewed`,
`request_info`, `answer_info_request`, `mark_satisfied`, `get_or_create_thread`, `submit_payment`, `confirm_payment`,
`dispute_payment`, `respond_to_dispute`, `release_expired_reservations`, and admin: `admin_resolve_dispute`,
`admin_set_role`, `admin_suspend_user`, `admin_moderate_request`, `admin_resolve_report`, `admin_stats`.
Server-only (`service_role`): `check_rate_limit`, `cleanup_rate_limits`, `claim_email_outbox`, `finish_email`. Internal helpers (`_notify`, `_event`, `_audit`, …) are not executable by clients.

Errors are raised as machine codes (`raise exception 'already_reserved'`); the app maps them to translated messages (a test asserts every code has a translation).

## Notable rules enforced in SQL
- Reservation: donor role, verified email, request `open`, no unresolved payment, ≤ 3 active per donor, unique active index + row lock.
- `mark_reviewed` requires an `original` access log by that donor: "independent review" is real.
- Financial fields freeze (`request_locked`) once any donor review/question/reservation/payment exists.
- `submit_payment`: amount ≤ remaining, date within 30 days and not future, receipt must be the donor's own receipt document for this request, late evidence allowed 24 h after expiry only if nobody else took the request.
- Confirming a payment that completes the bill sets `completed`; otherwise the request reopens with the remaining balance.

## Testing the database
`npm run test:db` creates a disposable cluster, applies `tests/db/00_supabase_stub.sql` (a minimal stand-in for Supabase roles/auth/storage) plus all migrations, then runs `tests/db/20_rls_and_workflow.sql` (105 assertions), `tests/db/25_outbox_and_blobs.sql` (blobs + outbox, 18 assertions), applies `setup_all.sql` to a second fresh database, and a parallel-session race test. The stub is **not** Supabase: re-verify on a real project (see DEPLOYMENT.md checklist).

## Adding migrations
New tables must `enable row level security` and be granted explicitly (default privileges are revoked for `anon`/`authenticated`). Add a test.
