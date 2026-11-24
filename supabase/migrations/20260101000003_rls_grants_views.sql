-- =====================================================================
-- Row Level Security, grants, public views, storage.
-- Principle: deny by default. Clients get the minimum table/column privileges and
-- every change to workflow state goes through SECURITY DEFINER functions (0002).
-- =====================================================================

-- ---------- 1. Lock everything down, then grant back minimally ----------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

-- ---------- 2. Enable RLS on EVERY table ----------
alter table public.app_settings            enable row level security;
alter table public.profiles                enable row level security;
alter table public.requests                enable row level security;
alter table public.request_payment_details enable row level security;
alter table public.documents               enable row level security;
alter table public.document_access_logs    enable row level security;
alter table public.reservations            enable row level security;
alter table public.donor_reviews           enable row level security;
alter table public.info_requests           enable row level security;
alter table public.threads                 enable row level security;
alter table public.messages                enable row level security;
alter table public.saved_requests          enable row level security;
alter table public.payments                enable row level security;
alter table public.request_events          enable row level security;
alter table public.audit_logs              enable row level security;
alter table public.security_events         enable row level security;
alter table public.notifications           enable row level security;
alter table public.reports                 enable row level security;
alter table public.rate_limits             enable row level security;
alter table public.contact_messages        enable row level security;

-- ---------- 3. Helper used by policies ----------
create function public._can_see_payment_details(p_request uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.requests r where r.id = p_request and r.requester_id = auth.uid())
      or exists (select 1 from public.reservations v
                  where v.request_id = p_request and v.donor_id = auth.uid()
                    and (v.status = 'active' and v.expires_at > now()))
      or exists (select 1 from public.payments p
                  where p.request_id = p_request and p.donor_id = auth.uid());
$$;

create function public._payment_details_editable(p_request uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.requests r
                  where r.id = p_request and r.requester_id = auth.uid()
                    and r.lifecycle in ('draft', 'open')
                    and not exists (select 1 from public.reservations v where v.request_id = r.id and v.status = 'active'));
$$;

-- Donors have no direct read access to `requests`, so the report policy asks this narrow helper
-- whether a request is reportable (published, and not the caller's own).
create function public._is_reportable_request(p_request uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.requests r
                  where r.id = p_request and r.requester_id <> auth.uid() and r.lifecycle <> 'draft');
$$;

-- ---------- 4. Policies ----------
-- app_settings: admin read only (writes: service role only)
create policy app_settings_admin_read on public.app_settings for select to authenticated using (public.is_admin());

-- profiles: own row (read/update limited columns), admin read
create policy profiles_select_own   on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_select_admin on public.profiles for select to authenticated using (public.is_admin());
create policy profiles_update_own   on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- requests: owner + admin. Donors/public read through public_request_cards (view).
create policy requests_select_own   on public.requests for select to authenticated using (requester_id = auth.uid());
create policy requests_select_admin on public.requests for select to authenticated using (public.is_admin());
create policy requests_insert_own   on public.requests for insert to authenticated
  with check (
    requester_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'requester' and not p.is_suspended)
  );
create policy requests_update_own   on public.requests for update to authenticated
  using (requester_id = auth.uid() and lifecycle in ('draft', 'open'))
  with check (requester_id = auth.uid());

-- payment details
create policy rpd_select on public.request_payment_details for select to authenticated
  using (public._can_see_payment_details(request_id) or public.is_admin());
create policy rpd_insert on public.request_payment_details for insert to authenticated
  with check (public._payment_details_editable(request_id));
create policy rpd_update on public.request_payment_details for update to authenticated
  using (public._payment_details_editable(request_id)) with check (public._payment_details_editable(request_id));

-- documents: metadata readable by owner, request owner, admin. Writes only via server (service role).
create policy documents_select_owner on public.documents for select to authenticated using (owner_id = auth.uid());
create policy documents_select_requester on public.documents for select to authenticated
  using (exists (select 1 from public.requests r where r.id = request_id and r.requester_id = auth.uid()));
create policy documents_select_admin on public.documents for select to authenticated using (public.is_admin());

-- document access logs: request owner sees who opened their documents; admin sees all. Inserts: service role only.
create policy dal_select_requester on public.document_access_logs for select to authenticated
  using (exists (select 1 from public.requests r where r.id = request_id and r.requester_id = auth.uid()));
create policy dal_select_admin on public.document_access_logs for select to authenticated using (public.is_admin());

-- reservations: donor, request owner, admin read. Writes only through functions.
create policy reservations_select_donor on public.reservations for select to authenticated using (donor_id = auth.uid());
create policy reservations_select_requester on public.reservations for select to authenticated
  using (exists (select 1 from public.requests r where r.id = request_id and r.requester_id = auth.uid()));
create policy reservations_select_admin on public.reservations for select to authenticated using (public.is_admin());

-- donor reviews / info requests
create policy donor_reviews_select_donor on public.donor_reviews for select to authenticated using (donor_id = auth.uid());
create policy donor_reviews_select_requester on public.donor_reviews for select to authenticated
  using (exists (select 1 from public.requests r where r.id = request_id and r.requester_id = auth.uid()));
create policy donor_reviews_select_admin on public.donor_reviews for select to authenticated using (public.is_admin());

create policy info_requests_select_donor on public.info_requests for select to authenticated using (donor_id = auth.uid());
create policy info_requests_select_requester on public.info_requests for select to authenticated
  using (exists (select 1 from public.requests r where r.id = request_id and r.requester_id = auth.uid()));
create policy info_requests_select_admin on public.info_requests for select to authenticated using (public.is_admin());

-- threads / messages: participants only (admins deliberately have NO access to private messages)
create policy threads_select_participant on public.threads for select to authenticated
  using (donor_id = auth.uid() or requester_id = auth.uid());
create policy messages_select_participant on public.messages for select to authenticated
  using (exists (select 1 from public.threads t where t.id = thread_id and (t.donor_id = auth.uid() or t.requester_id = auth.uid())));
create policy messages_insert_participant on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (select 1 from public.threads t where t.id = thread_id and (t.donor_id = auth.uid() or t.requester_id = auth.uid()))
    and exists (select 1 from public.profiles p where p.id = auth.uid() and not p.is_suspended)
  );
-- recipient may mark messages read (column grant restricts this to read_at)
create policy messages_update_recipient on public.messages for update to authenticated
  using (sender_id <> auth.uid()
         and exists (select 1 from public.threads t where t.id = thread_id and (t.donor_id = auth.uid() or t.requester_id = auth.uid())))
  with check (sender_id <> auth.uid());

-- saved requests
create policy saved_select_own on public.saved_requests for select to authenticated using (donor_id = auth.uid());
create policy saved_insert_own on public.saved_requests for insert to authenticated
  with check (donor_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'donor'));
create policy saved_delete_own on public.saved_requests for delete to authenticated using (donor_id = auth.uid());

-- payments (read only; writes via functions)
create policy payments_select_donor on public.payments for select to authenticated using (donor_id = auth.uid());
create policy payments_select_requester on public.payments for select to authenticated
  using (exists (select 1 from public.requests r where r.id = request_id and r.requester_id = auth.uid()));
create policy payments_select_admin on public.payments for select to authenticated using (public.is_admin());

-- request events (audit history)
create policy events_select_requester on public.request_events for select to authenticated
  using (exists (select 1 from public.requests r where r.id = request_id and r.requester_id = auth.uid()));
create policy events_select_actor on public.request_events for select to authenticated using (actor_id = auth.uid());
create policy events_select_admin on public.request_events for select to authenticated using (public.is_admin());

-- audit logs / security events
create policy audit_select_admin on public.audit_logs for select to authenticated using (public.is_admin());
create policy security_select_own on public.security_events for select to authenticated using (user_id = auth.uid());
create policy security_select_admin on public.security_events for select to authenticated using (public.is_admin());

-- notifications
create policy notifications_select_own on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update_own on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- reports
create policy reports_insert_own on public.reports for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and not p.is_suspended)
    and public._is_reportable_request(request_id)
  );
create policy reports_select_own on public.reports for select to authenticated using (reporter_id = auth.uid());
create policy reports_select_admin on public.reports for select to authenticated using (public.is_admin());

-- rate_limits: RLS on, NO policies => unreachable by clients.
-- contact_messages: admin read only; inserts via service role.
create policy contact_select_admin on public.contact_messages for select to authenticated using (public.is_admin());

-- ---------- 5. Table & column grants ----------
grant select on public.profiles, public.requests, public.request_payment_details, public.documents,
                public.document_access_logs, public.reservations, public.donor_reviews, public.info_requests,
                public.threads, public.messages, public.saved_requests, public.payments, public.request_events,
                public.audit_logs, public.security_events, public.notifications, public.reports,
                public.contact_messages, public.app_settings
  to authenticated;

-- Column-level UPDATE/INSERT: protected columns (role, lifecycle, verification_status, amount_paid, flags...) are NOT grantable.
grant update (full_name, phone, city, bio, preferred_locale, last_seen_at) on public.profiles to authenticated;
grant insert (requester_id, title, description, utility_type, provider_name, city, amount_due, due_date, hardship_note)
  on public.requests to authenticated;
grant update (title, description, utility_type, provider_name, city, amount_due, due_date, hardship_note)
  on public.requests to authenticated;
grant insert (request_id, consumer_ref, account_title, payment_note) on public.request_payment_details to authenticated;
grant update (consumer_ref, account_title, payment_note) on public.request_payment_details to authenticated;
grant insert (thread_id, sender_id, body) on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;
grant insert (donor_id, request_id) on public.saved_requests to authenticated;
grant delete on public.saved_requests to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant insert (request_id, reporter_id, reason, details) on public.reports to authenticated;

-- ---------- 6. Function grants ----------
grant execute on function
  public.is_admin(),
  public.release_expired_reservations(),
  public.reserve_request(uuid, integer),
  public.cancel_reservation(uuid),
  public.submit_request(uuid),
  public.cancel_request(uuid),
  public.mark_reviewed(uuid, text),
  public.request_info(uuid, text),
  public.answer_info_request(uuid, text),
  public.mark_satisfied(uuid),
  public.get_or_create_thread(uuid),
  public.submit_payment(uuid, numeric, public.payment_method, text, timestamptz, uuid),
  public.confirm_payment(uuid, text),
  public.dispute_payment(uuid, text),
  public.respond_to_dispute(uuid, text),
  public.admin_resolve_dispute(uuid, boolean, text),
  public.admin_set_role(uuid, public.user_role),
  public.admin_suspend_user(uuid, boolean, text),
  public.admin_moderate_request(uuid, text, text),
  public.admin_resolve_report(uuid, public.report_status, text),
  public.admin_stats()
  to authenticated;

-- Server-only (service role): rate limiting, cleanup, privileged role changes by scripts.
grant execute on function public.check_rate_limit(text, integer, integer), public.cleanup_rate_limits() to service_role;
grant execute on function public.admin_set_role(uuid, public.user_role), public.release_expired_reservations() to service_role;
-- Anonymous visitors may only call the harmless sweep (keeps public pages' availability accurate).
grant execute on function public.release_expired_reservations() to anon;
-- Policy helper functions are invoked by RLS as the querying role, so they need EXECUTE.
grant execute on function public._can_see_payment_details(uuid), public._payment_details_editable(uuid),
                          public._is_reportable_request(uuid), public._setting(text, text)
  to authenticated;
grant execute on function public.is_admin() to anon;

-- ---------- 7. Public views (explicit safe column lists; no requester identity or contact info) ----------
-- NOTE: these views intentionally run with the view owner's rights (security definer semantics) so
-- anonymous visitors can see approved public fields without any access to the base tables.
create view public.public_request_cards as
select
  r.id, r.title, r.description, r.utility_type, r.provider_name, r.city,
  r.amount_due, r.amount_paid, r.currency, r.due_date,
  r.lifecycle, r.verification_status, r.created_at, r.published_at,
  split_part(p.full_name, ' ', 1) as requester_first_name,
  (select count(*) from public.donor_reviews dr where dr.request_id = r.id)::int as review_count,
  (select count(*) from public.donor_reviews dr where dr.request_id = r.id and dr.status = 'satisfied')::int as satisfied_count,
  exists (select 1 from public.documents d
          where d.request_id = r.id and d.kind = 'bill' and d.status = 'active' and d.preview_path is not null) as has_preview,
  r.search
from public.requests r
join public.profiles p on p.id = r.requester_id
where r.lifecycle in ('open', 'reserved', 'payment_pending', 'completed')
  and p.is_suspended = false;

-- Names of people you share a request/thread with (first name only).
create view public.profile_names as
select id, split_part(full_name, ' ', 1) as display_name, role
from public.profiles
where not is_suspended;

create view public.platform_stats as
select
  (select count(*) from public.requests where lifecycle in ('open', 'reserved', 'payment_pending'))::int as active_requests,
  (select count(*) from public.requests where lifecycle = 'completed')::int as completed_requests,
  (select count(*) from public.profiles where role = 'donor')::int as donors,
  (select count(*) from public.profiles where role = 'requester')::int as requesters,
  (select coalesce(sum(amount), 0) from public.payments where status in ('confirmed', 'resolved_valid')) as total_confirmed_amount,
  (select count(*) from public.payments where status in ('confirmed', 'resolved_valid'))::int as confirmed_payments,
  (select count(*) from public.payments where status in ('disputed', 'resolved_invalid'))::int as disputed_payments,
  (select count(*) from public.reports where status = 'actioned')::int as reports_actioned;

grant select on public.public_request_cards, public.platform_stats to anon, authenticated;
grant select on public.profile_names to authenticated;

-- ---------- 8. Storage: one PRIVATE bucket, zero client policies ----------
-- All reads/writes happen server-side with the service role after authorization checks;
-- clients only ever receive short-lived signed URLs. With RLS on storage.objects and no
-- policies for anon/authenticated, direct client access is impossible.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 5242880, array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'application/pdf'];
