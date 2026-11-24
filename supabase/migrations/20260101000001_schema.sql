-- =====================================================================
-- Bill Sponsorship Platform — core schema
-- Run order matters. All tables are in `public`. RLS is enabled in 0003.
-- =====================================================================

-- ---------- Enums ----------
create type public.user_role          as enum ('requester', 'donor', 'admin');
create type public.utility_type       as enum ('electricity', 'gas', 'water', 'internet', 'phone', 'other');
create type public.request_lifecycle  as enum ('draft', 'open', 'reserved', 'payment_pending', 'completed', 'cancelled', 'removed');
create type public.verification_status as enum (
  'uploaded_unverified',  -- Uploaded / Not independently verified
  'donor_reviewed',       -- Donor reviewed
  'info_requested',       -- Additional information requested
  'info_provided',        -- Information provided
  'donor_satisfied',      -- Donor satisfied
  'payment_submitted',    -- Payment submitted
  'requester_confirmed',  -- Requester confirmed
  'payment_disputed',     -- Payment disputed
  'completed'             -- Completed
);
create type public.document_kind      as enum ('bill', 'supporting', 'receipt');
create type public.reservation_status as enum ('active', 'expired', 'cancelled', 'converted');
create type public.payment_method     as enum ('easypaisa', 'jazzcash', 'bank_app', 'other');
create type public.payment_status     as enum ('submitted', 'confirmed', 'disputed', 'resolved_valid', 'resolved_invalid');
create type public.info_request_status as enum ('open', 'answered', 'closed');
create type public.report_reason      as enum ('fake_bill', 'altered_bill', 'duplicate', 'inappropriate', 'harassment', 'other');
create type public.report_status      as enum ('open', 'reviewing', 'actioned', 'dismissed');

-- ---------- Generic helpers ----------
create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- App settings (server-managed) ----------
create table public.app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
insert into public.app_settings(key, value) values
  ('require_admin_mfa', 'true'),
  ('max_active_reservations_per_donor', '3'),
  ('max_open_requests_per_requester', '3');

-- ---------- Profiles ----------
create table public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  role             public.user_role not null default 'requester',
  full_name        text not null check (char_length(full_name) between 1 and 120),
  phone            text check (phone is null or phone ~ '^[+0-9 -]{7,20}$'),
  city             text check (city is null or char_length(city) <= 80),
  bio              text check (bio is null or char_length(bio) <= 500),
  preferred_locale text not null default 'en' check (preferred_locale in ('en', 'ur')),
  is_suspended     boolean not null default false,
  suspended_reason text,
  last_seen_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger trg_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- New auth user -> profile. The role comes ONLY from the signup choice and can
-- never be 'admin'. user_metadata is user-controlled and is never used for authorization.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_role public.user_role;
begin
  v_role := case when new.raw_user_meta_data ->> 'role' = 'donor'
                 then 'donor'::public.user_role else 'requester'::public.user_role end;
  insert into public.profiles (id, role, full_name, preferred_locale)
  values (
    new.id, v_role,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), nullif(split_part(new.email, '@', 1), ''), 'User'), 120),
    case when new.raw_user_meta_data ->> 'locale' = 'ur' then 'ur' else 'en' end
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Requests ----------
create table public.requests (
  id                  uuid primary key default gen_random_uuid(),
  requester_id        uuid not null references public.profiles(id) on delete restrict,
  title               text not null check (char_length(title) between 5 and 120),
  description         text not null check (char_length(description) between 20 and 2000),
  utility_type        public.utility_type not null,
  provider_name       text not null check (char_length(provider_name) between 2 and 80),
  city                text not null check (char_length(city) between 2 and 80),
  amount_due          numeric(12,2) not null check (amount_due > 0 and amount_due <= 500000),
  amount_paid         numeric(12,2) not null default 0 check (amount_paid >= 0),
  currency            text not null default 'PKR' check (currency = 'PKR'),
  due_date            date not null,
  hardship_note       text check (hardship_note is null or char_length(hardship_note) <= 1000),
  lifecycle           public.request_lifecycle not null default 'draft',
  verification_status public.verification_status not null default 'uploaded_unverified',
  flagged             boolean not null default false,
  published_at        timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  search              tsvector generated always as (
    to_tsvector('simple'::regconfig,
      coalesce(title, '') || ' ' || coalesce(description, '') || ' ' ||
      coalesce(provider_name, '') || ' ' || coalesce(city, ''))
  ) stored,
  constraint amount_paid_le_due check (amount_paid <= amount_due)
);
create index requests_lifecycle_idx on public.requests (lifecycle, created_at desc);
create index requests_requester_idx on public.requests (requester_id);
create index requests_search_idx    on public.requests using gin (search);
create index requests_filter_idx    on public.requests (utility_type, city);
create trigger trg_requests_touch before update on public.requests
  for each row execute function public.touch_updated_at();

-- Full consumer / reference number: needed to pay, so it is visible ONLY to the
-- requester and to a donor who holds an active reservation or has a payment on the request.
create table public.request_payment_details (
  request_id    uuid primary key references public.requests(id) on delete cascade,
  consumer_ref  text not null check (char_length(consumer_ref) between 4 and 40 and consumer_ref ~ '^[A-Za-z0-9 -]+$'),
  account_title text check (account_title is null or char_length(account_title) <= 120),
  payment_note  text check (payment_note is null or char_length(payment_note) <= 300),
  updated_at    timestamptz not null default now()
);
create trigger trg_rpd_touch before update on public.request_payment_details
  for each row execute function public.touch_updated_at();

-- ---------- Documents (metadata only; files live in private Storage) ----------
create table public.documents (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references public.requests(id) on delete cascade,
  owner_id      uuid not null references public.profiles(id) on delete restrict,
  kind          public.document_kind not null,
  storage_path  text not null unique,
  preview_path  text unique,
  display_name  text not null check (char_length(display_name) <= 80),
  mime_type     text not null check (mime_type in ('image/jpeg', 'image/png', 'application/pdf')),
  size_bytes    integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  sha256        text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  redaction     jsonb not null default '{}'::jsonb,
  status        text not null default 'active' check (status in ('active', 'removed')),
  created_at    timestamptz not null default now()
);
create index documents_request_idx on public.documents (request_id);
create index documents_owner_idx   on public.documents (owner_id);
create index documents_sha_idx     on public.documents (sha256);
-- The same file may not be attached twice to the same request.
create unique index documents_request_sha_uniq on public.documents (request_id, sha256) where status = 'active';

create table public.document_access_logs (
  id           bigint generated always as identity primary key,
  document_id  uuid not null references public.documents(id) on delete cascade,
  request_id   uuid not null references public.requests(id) on delete cascade,
  accessor_id  uuid references public.profiles(id) on delete set null,
  access_type  text not null check (access_type in ('original', 'preview')),
  ip_hash      text,
  user_agent   text check (user_agent is null or char_length(user_agent) <= 300),
  created_at   timestamptz not null default now()
);
create index dal_doc_idx      on public.document_access_logs (document_id, created_at desc);
create index dal_accessor_idx on public.document_access_logs (accessor_id, request_id, access_type);

-- ---------- Reservations ----------
create table public.reservations (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.requests(id) on delete cascade,
  donor_id    uuid not null references public.profiles(id) on delete restrict,
  status      public.reservation_status not null default 'active',
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  ended_at    timestamptz
);
-- THE concurrency guarantee: at most one active reservation per request, enforced by the database.
create unique index reservations_one_active_per_request on public.reservations (request_id) where status = 'active';
create index reservations_donor_idx   on public.reservations (donor_id, status);
create index reservations_expiry_idx  on public.reservations (expires_at) where status = 'active';

-- ---------- Donor-driven verification ----------
create table public.donor_reviews (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.requests(id) on delete cascade,
  donor_id    uuid not null references public.profiles(id) on delete cascade,
  status      text not null check (status in ('reviewed', 'satisfied')),
  note        text check (note is null or char_length(note) <= 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (request_id, donor_id)
);
create trigger trg_donor_reviews_touch before update on public.donor_reviews
  for each row execute function public.touch_updated_at();

create table public.info_requests (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.requests(id) on delete cascade,
  donor_id    uuid not null references public.profiles(id) on delete cascade,
  question    text not null check (char_length(question) between 10 and 1000),
  response    text check (response is null or char_length(response) <= 2000),
  status      public.info_request_status not null default 'open',
  created_at  timestamptz not null default now(),
  answered_at timestamptz
);
create index info_requests_request_idx on public.info_requests (request_id, status);

-- ---------- Messaging ----------
create table public.threads (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references public.requests(id) on delete cascade,
  donor_id      uuid not null references public.profiles(id) on delete cascade,
  requester_id  uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (request_id, donor_id)
);
create index threads_donor_idx     on public.threads (donor_id);
create index threads_requester_idx on public.threads (requester_id);

create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.threads(id) on delete cascade,
  sender_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 2000),
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index messages_thread_idx on public.messages (thread_id, created_at);

-- ---------- Saved ----------
create table public.saved_requests (
  donor_id   uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null references public.requests(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (donor_id, request_id)
);

-- ---------- Payments (evidence only — the platform never holds money) ----------
create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  request_id          uuid not null references public.requests(id) on delete restrict,
  donor_id            uuid not null references public.profiles(id) on delete restrict,
  reservation_id      uuid not null references public.reservations(id) on delete restrict,
  amount              numeric(12,2) not null check (amount > 0),
  method              public.payment_method not null,
  transaction_ref     text not null check (transaction_ref ~ '^[A-Za-z0-9._-]{4,64}$'),
  paid_at             timestamptz not null,
  receipt_document_id uuid not null references public.documents(id) on delete restrict,
  status              public.payment_status not null default 'submitted',
  requester_note      text check (requester_note is null or char_length(requester_note) <= 1000),
  dispute_reason      text check (dispute_reason is null or char_length(dispute_reason) <= 1000),
  donor_response      text check (donor_response is null or char_length(donor_response) <= 1000),
  admin_note          text,
  created_at          timestamptz not null default now(),
  resolved_at         timestamptz
);
create index payments_request_idx on public.payments (request_id, status);
create index payments_donor_idx   on public.payments (donor_id);
-- Duplicate-submission protection
create unique index payments_one_per_reservation on public.payments (reservation_id);
create unique index payments_receipt_uniq        on public.payments (receipt_document_id);
create unique index payments_txref_uniq          on public.payments (request_id, lower(transaction_ref));

-- ---------- Audit trail ----------
create table public.request_events (
  id          bigint generated always as identity primary key,
  request_id  uuid not null references public.requests(id) on delete cascade,
  actor_id    uuid references public.profiles(id) on delete set null,
  event_type  text not null,
  from_status text,
  to_status   text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index request_events_idx on public.request_events (request_id, created_at);

create table public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null,
  entity_type text not null,
  entity_id   text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_logs_idx on public.audit_logs (created_at desc);

create table public.security_events (
  id         bigint generated always as identity primary key,
  user_id    uuid references public.profiles(id) on delete set null,
  event_type text not null,
  ip_hash    text,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index security_events_idx on public.security_events (created_at desc);
create index security_events_user_idx on public.security_events (user_id, created_at desc);

-- ---------- Notifications ----------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null,
  link       text,
  data       jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx   on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

-- ---------- Reports ----------
create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.requests(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason      public.report_reason not null,
  details     text check (details is null or char_length(details) <= 1000),
  status      public.report_status not null default 'open',
  admin_note  text,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  unique (request_id, reporter_id)
);
create index reports_status_idx on public.reports (status, created_at desc);

-- ---------- Server-only tables ----------
create table public.rate_limits (
  key          text primary key,
  count        integer not null,
  window_start timestamptz not null
);

create table public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 120),
  email      text not null check (char_length(email) between 3 and 254),
  message    text not null check (char_length(message) between 10 and 3000),
  ip_hash    text,
  created_at timestamptz not null default now()
);
